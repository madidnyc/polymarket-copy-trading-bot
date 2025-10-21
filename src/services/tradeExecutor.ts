import { ClobClient } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { ENV } from '../config/env';
import { getUserActivityModel } from '../models/userHistory';
import fetchData from '../utils/fetchData';
import getMyBalance from '../utils/getMyBalance';
import postOrder from '../utils/postOrder';
import Logger from '../utils/logger';

const USER_ADDRESSES = ENV.USER_ADDRESSES;
const RETRY_LIMIT = ENV.RETRY_LIMIT;
const PROXY_WALLET = ENV.PROXY_WALLET;
const TRADE_AGGREGATION_ENABLED = ENV.TRADE_AGGREGATION_ENABLED;
const TRADE_AGGREGATION_WINDOW_SECONDS = ENV.TRADE_AGGREGATION_WINDOW_SECONDS;
const TRADE_AGGREGATION_MIN_TOTAL_USD = 1.0; // Polymarket minimum

// Create activity models for each user
const userActivityModels = USER_ADDRESSES.map((address) => ({
    address,
    model: getUserActivityModel(address),
}));

interface TradeWithUser extends UserActivityInterface {
    userAddress: string;
}

interface AggregatedTrade {
    userAddress: string;
    conditionId: string;
    asset: string;
    side: string;
    slug?: string;
    eventSlug?: string;
    trades: TradeWithUser[];
    totalUsdcSize: number;
    averagePrice: number;
    firstTradeTime: number;
    lastTradeTime: number;
}

// Buffer for aggregating trades
const tradeAggregationBuffer: Map<string, AggregatedTrade> = new Map();

const readTempTrades = async (): Promise<TradeWithUser[]> => {
    const allTrades: TradeWithUser[] = [];

    for (const { address, model } of userActivityModels) {
        // Only get trades that haven't been processed yet (bot: false AND botExcutedTime: 0)
        // This prevents processing the same trade multiple times
        const trades = await model.find({
            $and: [{ type: 'TRADE' }, { bot: false }, { botExcutedTime: 0 }],
        }).exec();

        const tradesWithUser = trades.map((trade) => ({
            ...(trade.toObject() as UserActivityInterface),
            userAddress: address,
        }));

        allTrades.push(...tradesWithUser);
    }

    return allTrades;
};

/**
 * Generate a unique key for trade aggregation based on user, market, side
 */
const getAggregationKey = (trade: TradeWithUser): string => {
    return `${trade.userAddress}:${trade.conditionId}:${trade.asset}:${trade.side}`;
};

/**
 * Add trade to aggregation buffer or update existing aggregation
 */
const addToAggregationBuffer = (trade: TradeWithUser): void => {
    const key = getAggregationKey(trade);
    const existing = tradeAggregationBuffer.get(key);
    const now = Date.now();

    if (existing) {
        // Update existing aggregation
        existing.trades.push(trade);
        existing.totalUsdcSize += trade.usdcSize;
        // Recalculate weighted average price
        const totalValue = existing.trades.reduce((sum, t) => sum + (t.usdcSize * t.price), 0);
        existing.averagePrice = totalValue / existing.totalUsdcSize;
        existing.lastTradeTime = now;
    } else {
        // Create new aggregation
        tradeAggregationBuffer.set(key, {
            userAddress: trade.userAddress,
            conditionId: trade.conditionId,
            asset: trade.asset,
            side: trade.side || 'BUY',
            slug: trade.slug,
            eventSlug: trade.eventSlug,
            trades: [trade],
            totalUsdcSize: trade.usdcSize,
            averagePrice: trade.price,
            firstTradeTime: now,
            lastTradeTime: now,
        });
    }
};

/**
 * Check buffer and return ready aggregated trades
 * Trades are ready if:
 * 1. Total size >= minimum AND
 * 2. Time window has passed since first trade
 */
const getReadyAggregatedTrades = (): AggregatedTrade[] => {
    const ready: AggregatedTrade[] = [];
    const now = Date.now();
    const windowMs = TRADE_AGGREGATION_WINDOW_SECONDS * 1000;

    for (const [key, agg] of tradeAggregationBuffer.entries()) {
        const timeElapsed = now - agg.firstTradeTime;

        // Check if aggregation is ready
        if (timeElapsed >= windowMs) {
            if (agg.totalUsdcSize >= TRADE_AGGREGATION_MIN_TOTAL_USD) {
                // Aggregation meets minimum and window passed - ready to execute
                ready.push(agg);
            } else {
                // Window passed but total too small - mark individual trades as skipped
                Logger.info(`Trade aggregation for ${agg.userAddress} on ${agg.slug || agg.asset}: $${agg.totalUsdcSize.toFixed(2)} total from ${agg.trades.length} trades below minimum ($${TRADE_AGGREGATION_MIN_TOTAL_USD}) - skipping`);

                // Mark all trades in this aggregation as processed (bot: true)
                for (const trade of agg.trades) {
                    const UserActivity = getUserActivityModel(trade.userAddress);
                    UserActivity.updateOne({ _id: trade._id }, { bot: true }).exec();
                }
            }
            // Remove from buffer either way
            tradeAggregationBuffer.delete(key);
        }
    }

    return ready;
};

const doTrading = async (clobClient: ClobClient, trades: TradeWithUser[]) => {
    for (const trade of trades) {
        // Mark trade as being processed immediately to prevent duplicate processing
        const UserActivity = getUserActivityModel(trade.userAddress);
        await UserActivity.updateOne(
            { _id: trade._id },
            { $set: { botExcutedTime: 1 } }
        );

        Logger.trade(trade.userAddress, trade.side || 'UNKNOWN', {
            asset: trade.asset,
            side: trade.side,
            amount: trade.usdcSize,
            price: trade.price,
            slug: trade.slug,
            eventSlug: trade.eventSlug,
            transactionHash: trade.transactionHash,
        });

        const my_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`
        );
        const user_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${trade.userAddress}`
        );
        const my_position = my_positions.find(
            (position: UserPositionInterface) => position.conditionId === trade.conditionId
        );
        const user_position = user_positions.find(
            (position: UserPositionInterface) => position.conditionId === trade.conditionId
        );

        // Get USDC balance
        const my_balance = await getMyBalance(PROXY_WALLET);

        // Calculate trader's total portfolio value from positions
        const user_balance = user_positions.reduce((total, pos) => {
            return total + (pos.currentValue || 0);
        }, 0);

        Logger.balance(my_balance, user_balance, trade.userAddress);

        // Execute the trade
        await postOrder(
            clobClient,
            trade.side === 'BUY' ? 'buy' : 'sell',
            my_position,
            user_position,
            trade,
            my_balance,
            user_balance,
            trade.userAddress
        );

        Logger.separator();
    }
};

/**
 * Execute aggregated trades
 */
const doAggregatedTrading = async (clobClient: ClobClient, aggregatedTrades: AggregatedTrade[]) => {
    for (const agg of aggregatedTrades) {
        Logger.header(`📊 AGGREGATED TRADE (${agg.trades.length} trades combined)`);
        Logger.info(`Market: ${agg.slug || agg.asset}`);
        Logger.info(`Side: ${agg.side}`);
        Logger.info(`Total volume: $${agg.totalUsdcSize.toFixed(2)}`);
        Logger.info(`Average price: $${agg.averagePrice.toFixed(4)}`);

        // Mark all individual trades as being processed
        for (const trade of agg.trades) {
            const UserActivity = getUserActivityModel(trade.userAddress);
            await UserActivity.updateOne(
                { _id: trade._id },
                { $set: { botExcutedTime: 1 } }
            );
        }

        const my_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`
        );
        const user_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${agg.userAddress}`
        );
        const my_position = my_positions.find(
            (position: UserPositionInterface) => position.conditionId === agg.conditionId
        );
        const user_position = user_positions.find(
            (position: UserPositionInterface) => position.conditionId === agg.conditionId
        );

        // Get USDC balance
        const my_balance = await getMyBalance(PROXY_WALLET);

        // Calculate trader's total portfolio value from positions
        const user_balance = user_positions.reduce((total, pos) => {
            return total + (pos.currentValue || 0);
        }, 0);

        Logger.balance(my_balance, user_balance, agg.userAddress);

        // Create a synthetic trade object for postOrder using aggregated values
        const syntheticTrade: UserActivityInterface = {
            ...agg.trades[0], // Use first trade as template
            usdcSize: agg.totalUsdcSize,
            price: agg.averagePrice,
            side: agg.side as 'BUY' | 'SELL',
        };

        // Execute the aggregated trade
        await postOrder(
            clobClient,
            agg.side === 'BUY' ? 'buy' : 'sell',
            my_position,
            user_position,
            syntheticTrade,
            my_balance,
            user_balance,
            agg.userAddress
        );

        Logger.separator();
    }
};

const tradeExcutor = async (clobClient: ClobClient) => {
    Logger.success(`Trade executor ready for ${USER_ADDRESSES.length} trader(s)`);
    if (TRADE_AGGREGATION_ENABLED) {
        Logger.info(`Trade aggregation enabled: ${TRADE_AGGREGATION_WINDOW_SECONDS}s window, $${TRADE_AGGREGATION_MIN_TOTAL_USD} minimum`);
    }

    let lastCheck = Date.now();
    while (true) {
        const trades = await readTempTrades();

        if (TRADE_AGGREGATION_ENABLED) {
            // Process with aggregation logic
            if (trades.length > 0) {
                Logger.clearLine();
                Logger.info(`📥 ${trades.length} new trade${trades.length > 1 ? 's' : ''} detected`);

                // Add trades to aggregation buffer
                for (const trade of trades) {
                    // Only aggregate BUY trades below minimum threshold
                    if (trade.side === 'BUY' && trade.usdcSize < TRADE_AGGREGATION_MIN_TOTAL_USD) {
                        Logger.info(`Adding $${trade.usdcSize.toFixed(2)} ${trade.side} trade to aggregation buffer for ${trade.slug || trade.asset}`);
                        addToAggregationBuffer(trade);
                    } else {
                        // Execute large trades immediately (not aggregated)
                        Logger.clearLine();
                        Logger.header(`⚡ IMMEDIATE TRADE (above threshold)`);
                        await doTrading(clobClient, [trade]);
                    }
                }
                lastCheck = Date.now();
            }

            // Check for ready aggregated trades
            const readyAggregations = getReadyAggregatedTrades();
            if (readyAggregations.length > 0) {
                Logger.clearLine();
                Logger.header(`⚡ ${readyAggregations.length} AGGREGATED TRADE${readyAggregations.length > 1 ? 'S' : ''} READY`);
                await doAggregatedTrading(clobClient, readyAggregations);
                lastCheck = Date.now();
            }

            // Update waiting message
            if (trades.length === 0 && readyAggregations.length === 0) {
                if (Date.now() - lastCheck > 300) {
                    const bufferedCount = tradeAggregationBuffer.size;
                    if (bufferedCount > 0) {
                        Logger.waiting(USER_ADDRESSES.length, `${bufferedCount} trade group(s) pending`);
                    } else {
                        Logger.waiting(USER_ADDRESSES.length);
                    }
                    lastCheck = Date.now();
                }
            }
        } else {
            // Original non-aggregation logic
            if (trades.length > 0) {
                Logger.clearLine();
                Logger.header(`⚡ ${trades.length} NEW TRADE${trades.length > 1 ? 'S' : ''} TO COPY`);
                await doTrading(clobClient, trades);
                lastCheck = Date.now();
            } else {
                // Update waiting message every 300ms for smooth animation
                if (Date.now() - lastCheck > 300) {
                    Logger.waiting(USER_ADDRESSES.length);
                    lastCheck = Date.now();
                }
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 300));
    }
};

export default tradeExcutor;
