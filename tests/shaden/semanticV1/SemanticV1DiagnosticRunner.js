'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const OpenRouterSemanticProvider =
  require('../../../src/services/shaden/semanticV1/OpenRouterSemanticProvider');

const SemanticInterpreterV1 =
  require('../../../src/services/shaden/semanticV1/SemanticInterpreterV1');

const cases =
  require('./SemanticV1DiagnosticCorpus');

async function main() {
  const provider =
    new OpenRouterSemanticProvider({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      model: process.env.SHADEN_LLM_MODEL,
    });

  const interpreter =
    new SemanticInterpreterV1({
      provider,
    });

  const results = [];

  let contractValid = 0;
  let contractInvalid = 0;
  let runtimeErrors = 0;

  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  for (const testCase of cases) {
    process.stdout.write(
      `${testCase.id} ${testCase.family} ... `
    );

    try {
      const response =
        await interpreter.interpret({
          currentMessage:
            testCase.currentMessage,

          contextTurns:
            testCase.contextTurns,
        });

      if (response.contractValid) {
        contractValid += 1;
      } else {
        contractInvalid += 1;
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
        currentMessage:
          testCase.currentMessage,
        contextTurns:
          testCase.contextTurns,

        actual:
          response.result,

        contractValid:
          response.contractValid,

        contractError:
          response.contractError,

        model:
          response.model,

        usage:
          response.usage,
      });

      console.log(
        response.contractValid
          ? 'CONTRACT_OK'
          : `CONTRACT_FAIL ${response.contractError?.message}`
      );
    } catch (error) {
      runtimeErrors += 1;

      results.push({
        id: testCase.id,
        family: testCase.family,
        currentMessage:
          testCase.currentMessage,
        contextTurns:
          testCase.contextTurns,

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
    totalCases: cases.length,
    contractValid,
    contractInvalid,
    runtimeErrors,

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
    'SemanticV1-diagnostic-run.json'
  );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(output, null, 2),
    'utf8'
  );

  console.log('\n=== DIAGNOSTIC SUMMARY ===');
  console.log(
    JSON.stringify(summary, null, 2)
  );

  console.log(
    `\nSaved: ${outputPath}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
