const promiseAllSettledCall =
  "CallExpression[callee.type='MemberExpression'][callee.object.name='Promise']:matches([callee.property.name='allSettled'], [callee.property.value='allSettled'])";

export default {
  files: ['apps/worker/src/workflows/**/*.ts'],
  linterOptions: { noInlineConfig: true },
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: `ExpressionStatement > ${promiseAllSettledCall}, ExpressionStatement > :matches(AwaitExpression, UnaryExpression[operator='void']) > ${promiseAllSettledCall}`,
        message: 'Use settleEffects() for Workflow effects or inspect the settlement results.',
      },
    ],
  },
};
