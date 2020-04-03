/* eslint-disable no-console */
'use strict';

require('source-map-support').install();

global.sinon = require('sinon');

const chai = (global.chai = require('chai'));

chai.use(require('sinon-chai'));
chai.should();

const bluebird = require('bluebird');
global.expect = chai.expect;
global.d = new Date();

bluebird.longStackTraces();

// '.timeout(ms, {cancel: true}) should throw error if cancellation cannot acquire connection' produced unhandled rejection and it's unclear how to avoid that
const EXPECTED_REJECTION_COUNT = 2;
const rejectionLog = [];
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  rejectionLog.push({
    reason,
  });
});

process.on('exit', (code) => {
  if (rejectionLog.length) {
    console.error(`Unhandled rejections: ${rejectionLog.length}`);
    rejectionLog.forEach((rejection) => {
      console.error(rejection);
    });

    if (rejectionLog.length > EXPECTED_REJECTION_COUNT) {
      process.exitCode = code || 1;
    }
  }
  console.log('No unhandled exceptions');
});

describe('Integration Tests', function() {
  require('./integration');
}, process.env.KNEX_TEST_TIMEOUT || 5000);

