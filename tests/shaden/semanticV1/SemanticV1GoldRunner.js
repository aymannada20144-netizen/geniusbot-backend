'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const OpenRouterSemanticProvider =
  require('../../../src/services/shaden/semanticV1/OpenRouterSemanticProvider');

const SemanticInterpreterV1 =
  require('../../../src/services/shaden/semanticV1/SemanticInterpreterV1');

const {
  scoreSemanticResult,
} = require('../../../src/services/shaden/semanticV1/SemanticScoringRubricV1');

const cases = require('./GoldCorpusV1');

async function main() {
  const provider = new OpenRouterSemanticProvider({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: process.env.OPENROUTER_BASE_URL,
    model: process.env.SHADEN_LLM_MODEL,
  });

  const interpreter = new SemanticInterpreterV1({
    provider,
  });

  const results = [];

  let autoPass = 0;
  let autoFail = 0;
  let contractViolation = 0;
  let critical = 0;

  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  for (const testCase of cases) {
    process.stdout.write(
      `${testCase.id} ${testCase.family} ... `
    );

    try {
      const response = await interpreter.interpret({
        currentMessage: testCase.currentMessage,
        contextTurns: testCase.contextTurns,
      });

      const score = scoreSemanticResult(
        testCase,
        response.result
      );

      if (score.status === 'AUTO_PASS') {
        autoPass += 1;
      } else if (
        score.status === 'CONTRACT_VIOLATION'
      ) {
        contractViolation += 1;
      } else {
        autoFail += 1;
      }

      if (score.critical) {
        critical += 1;
      }

      promptTokens +=
        response.usage?.promptTokens || 0;

      completionTokens +=
        response.usage?.completionTokens || 0;

      totalTokens +=
        response.usage?.totalTokens || 0;

      results.push({
        id: testCase.id,
        family: testCase.family,
        currentMessage: testCase.currentMessage,
        contextTurns: testCase.contextTurns,
        expected: testCase.expected,
        actual: response.result,
        contractValid: response.contractValid,
        contractError: response.contractError,
        score,
        model: response.model,
        usage: response.usage,
      });

      console.log(
        `${score.status}${score.critical ? ' CRITICAL' : ''}`
      );
    } catch (error) {
      results.push({
        id: testCase.id,
        family: testCase.family,
        runtimeError: {
          name: error.name,
          message: error.message,
        },
      });

      console.log(
        `RUNTIME_ERROR ${error.message}`
      );
    }
  }

  const summary = {
    run: 'A',
    totalCases: cases.length,
    autoPass,
    autoFail,
    contractViolation,
    critical,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
    },
  };

  const output = {
    summary,
    results,
  };

  const outputPath = path.join(
    __dirname,
    'SemanticV1-run-A.json'
  );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(output, null, 2),
    'utf8'
  );

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nSaved: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
