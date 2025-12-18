'use strict';

const { fetchEscrowTxnsByUserId } = require('./escrowService');

/**
 * AWS Lambda handler – triggered by EventBridge cron.
 *
 * Example EventBridge rule input:
 * {
 *   "userId": "68d26dcc287f9cf71fd8aa8d"
 * }
 */
exports.handler = async (event) => {
  try {
    // Basic screening for input
    const userId = event?.userId || process.env.USER_ID;
    if (!userId) {
      console.error('No userId supplied in event or USER_ID env var.');
      return { statusCode: 400, body: JSON.stringify({ message: 'Missing userId' }) };
    }

    // Delegate to service layer
    const txns = await fetchEscrowTxnsByUserId(userId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        count: txns.length,
        txns, // In production you might redact/trim this
      }),
    };
  } catch (error) {
    console.error('Error in Lambda:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error', error: String(error) }),
    };
  }
};
