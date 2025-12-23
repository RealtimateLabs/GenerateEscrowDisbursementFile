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
 * @param {string} userId - MongoDB ObjectId as string (userId)
 * @returns {Promise<Array>} List of TxnEscrow documents
 */
async function fetchEscrowTxnsByUserId(userId) {
  // Ensure DB connection
  await mongoosePromise;
  console.log('Connected to database.');

  const startingDate = new Date('2024-01-01T00:00:00');

  const query = [
    { $match: { txnType: 'rentCollection', 'escrow.ownerId': ObjectId(userId) } },
    // {
    //   $match: {
    //     'escrow.accountNum': {
    //       $in: ['RLTM252126609960', 'RLTM251536557720', 'RLTM250836494140', 'RLTM251936594620', 'RLTM251776579750', 'RLTM251656569910'],
    //     },
    //   },
    // },
    { $unwind: '$escrow' },
    { $match: { 'escrow.ownerId': ObjectId(userId) } },
    {
      $project: {
        _id: 1,
        'escrow.accountNum': 1,
        dateCreated: 1,
        status: 1,
        balance: {
          $toDouble: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$escrow.txns',
                    as: 'txn',
                    cond: {
                      $gte: ['$$txn.paymentDate', startingDate],
                    },
                  },
                },
                as: 'filteredTransaction',
                in: '$$filteredTransaction.amount',
              },
            },
          },
        },
        amountDisbursedThisMonth: {
          $toDouble: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$escrow.txns',
                    as: 'txn',
                    cond: {
                      $and: [
                        {
                          $gte: ['$$txn.paymentDate', new Date(new Date().getFullYear(), new Date().getMonth(), 1)],
                        },
                        {
                          $lt: ['$$txn.paymentDate', new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)],
                        },
                        { $lt: ['$$txn.amount', 0] },
                      ],
                    },
                  },
                },
                as: 'filteredTransaction',
                in: '$$filteredTransaction.amount',
              },
            },
          },
        },
        serviceAgmId: 1,
        rentalAgmId: 1,
      },
    },
    {
      $lookup: {
        from: 'rentcoltxns',
        localField: '_id',
        foreignField: '_id',
        as: 'txnDetails',
      },
    },
    {
      $project: {
        propertyAddress: '$txnDetails.propertyAddress',
        rent: { $arrayElemAt: ['$txnDetails.rent', 0] },
        serviceAgmId: { $arrayElemAt: ['$txnDetails.serviceAgmId', 0] },
        rentalAgmId: { $arrayElemAt: ['$txnDetails.rentalAgmId', 0] },
        disbursementRules: '$txnDetails.disbursementRules',
        expenses: '$txnDetails.expenses',
        escrow: 1,
        dateCreated: 1,
        status: 1,
        balance: 1,
        amountDisbursedThisMonth: 1,
        ownership: { $arrayElemAt: ['$txnDetails.ownership', 0] },
      },
    },
    {
      $lookup: {
        from: 'stampnsigntxns',
        localField: 'serviceAgmId',
        foreignField: '_id',
        as: 'serviceAgmTxn',
      },
    },
    {
      $lookup: {
        from: 'stampnsigntxns',
        localField: 'rentalAgmId',
        foreignField: '_id',
        as: 'rentalAgmTxn',
      },
    },
    {
      $project: {
        rent: 1,
        txnId: 1,
        escrow: 1,
        dateCreated: 1,
        status: 1,
        balance: 1,
        amountDisbursedThisMonth: 1,
        serviceAgmId: { $arrayElemAt: ['$serviceAgmTxn._id', 0] },
        rentalAgmId: { $arrayElemAt: ['$rentalAgmTxn._id', 0] },
        propertyAddress: 1,
        serviceAddress: '$serviceAgmTxn.propertyAddress.addressLine1',
        rentalAddress: '$rentalAgmTxn.propertyAddress.addressLine1',
        SA_SignStatus: '$serviceAgmTxn.status',
        RA_SignStatus: '$rentalAgmTxn.status',
        disbursementRules: 1,
        expenses: 1,
        ownership: 1,
      },
    },
    {
      $lookup: {
        from: 'agreementparams',
        localField: 'serviceAgmId',
        foreignField: '_id',
        as: 'serviceAgmParams',
      },
    },
    {
      $match: {
        status: 'open',
        rentalAgmId: { $exists: true },
        serviceAgmId: { $exists: true },
        // balance: { $gte: 10 },
      },
    },
    {
      $sort: { balance: -1 }, // sort the results
    },
  ];

  //   console.log('Querying TxnEscrow with:', query);
  const txns = await TxnEscrow.aggregate(query).exec();
  console.log(`Found ${txns.length} TxnEscrow records for userId ${userId}.`);

  return txns;
}

module.exports = {
  fetchEscrowTxnsByUserId,
};
