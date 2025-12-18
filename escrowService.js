'use strict';

const mongoose = require('mongoose');
const mongodb = require('mongodb');
const TxnEscrow = require('realtimatecommon/models/txn-escrow');

const ObjectId = mongodb.ObjectId;

// Reuse a single Mongoose connection across invocations
const mongoosePromise = mongoose.connect(
  process.env.MONGODB || 'mongodb+srv://username:password@cluster/dbname?retryWrites=true&w=majority'
);

/**
 * Connects to MongoDB (reusing existing connection) and fetches
 * all TxnEscrow records for the given userId.
 *
 * @param {string} userId - MongoDB ObjectId as string (ownerId)
 * @returns {Promise<Array>} List of TxnEscrow documents
 */
async function fetchEscrowTxnsByUserId(userId) {
  // Ensure DB connection
  await mongoosePromise;
  console.log('Connected to database.');

  const query = {
    'escrow.ownerId': ObjectId(userId),
    // Add any additional filters if needed
  };

  console.log('Querying TxnEscrow with:', query);

  const txns = await TxnEscrow.find(query).lean().exec();
  console.log(`Found ${txns.length} TxnEscrow records for userId ${userId}.`);

  return txns;
}

module.exports = {
  fetchEscrowTxnsByUserId,
};
