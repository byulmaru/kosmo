import { dev } from '@kosmo/core';
import { FieldError, KosmoError } from '@kosmo/core/error';
import { getOperationAST, GraphQLError, visit } from 'graphql';
import { isAsyncIterable } from 'graphql-yoga';
import type {
  ArgumentNode,
  ASTNode,
  DocumentNode,
  ExecutionResult,
  FragmentDefinitionNode,
  GraphQLErrorExtensions,
  SelectionSetNode,
} from 'graphql';
import type { Plugin } from 'graphql-yoga';
import type { UserContext } from '@/context';

const unwrapKosmoError = (error: unknown): KosmoError | null => {
  if (error instanceof KosmoError) {
    return error;
  }

  if (error instanceof GraphQLError && error.originalError) {
    return unwrapKosmoError(error.originalError);
  }

  return null;
};

const getKosmoErrorExtensions = (error: KosmoError): GraphQLErrorExtensions => ({
  code: error.code,
  ...(error instanceof FieldError && error.field ? { field: error.field } : {}),
});

const createUnexpectedGraphQLError = (error: unknown, graphQLError?: GraphQLError) => {
  const originalError =
    graphQLError?.originalError ?? (error instanceof Error ? error : new Error(String(error)));

  return new GraphQLError(dev ? originalError.message : 'Unexpected error', {
    nodes: graphQLError?.nodes,
    source: graphQLError?.source,
    positions: graphQLError?.positions,
    path: graphQLError?.path,
    extensions: {
      code: 'INTERNAL_SERVER_ERROR',
    },
    originalError: dev ? originalError : undefined,
  });
};

const createValidationGraphQLError = (graphQLError: GraphQLError) =>
  new GraphQLError('Invalid input', {
    nodes: graphQLError.nodes,
    source: graphQLError.source,
    positions: graphQLError.positions,
    path: graphQLError.path,
    extensions: {
      code: 'VALIDATION',
    },
  });

const isNativeOidcSessionInputError = (
  error: GraphQLError,
  nativeInputVariableNodes: ReadonlySet<ASTNode>,
) => {
  const isInputCoercionError = /^Variable "\$[^"]+" got invalid value/.test(error.message);

  return (
    isInputCoercionError && error.nodes?.some((node) => nativeInputVariableNodes.has(node)) === true
  );
};

const addAstNodes = (node: ASTNode, nodes: Set<ASTNode>) => {
  visit(node, {
    enter(node) {
      nodes.add(node);
    },
  });
};

const getFragmentDefinitions = (document: DocumentNode) => {
  const fragments = new Map<string, FragmentDefinitionNode>();

  for (const definition of document.definitions) {
    if (definition.kind === 'FragmentDefinition') {
      fragments.set(definition.name.value, definition);
    }
  }

  return fragments;
};

const getNativeOidcSessionInputArguments = (
  selectionSet: SelectionSetNode,
  fragments: ReadonlyMap<string, FragmentDefinitionNode>,
  visitedFragmentNames = new Set<string>(),
) => {
  const inputArguments: ArgumentNode[] = [];

  for (const selection of selectionSet.selections) {
    if (selection.kind === 'Field') {
      if (selection.name.value === 'exchangeNativeOidcSession') {
        const input = selection.arguments?.find((argument) => argument.name.value === 'input');
        if (input) {
          inputArguments.push(input);
        }
      }

      if (selection.selectionSet) {
        inputArguments.push(
          ...getNativeOidcSessionInputArguments(
            selection.selectionSet,
            fragments,
            visitedFragmentNames,
          ),
        );
      }
      continue;
    }

    if (selection.kind === 'InlineFragment') {
      inputArguments.push(
        ...getNativeOidcSessionInputArguments(
          selection.selectionSet,
          fragments,
          visitedFragmentNames,
        ),
      );
      continue;
    }

    const fragmentName = selection.name.value;
    const fragment = fragments.get(fragmentName);
    if (fragment && !visitedFragmentNames.has(fragmentName)) {
      const nestedVisitedFragmentNames = new Set(visitedFragmentNames).add(fragmentName);
      inputArguments.push(
        ...getNativeOidcSessionInputArguments(
          fragment.selectionSet,
          fragments,
          nestedVisitedFragmentNames,
        ),
      );
    }
  }

  return inputArguments;
};

const getNativeOidcSessionInputVariableNames = (inputArguments: readonly ArgumentNode[]) => {
  const variableNames = new Set<string>();

  for (const input of inputArguments) {
    visit(input.value, {
      Variable(node) {
        variableNames.add(node.name.value);
      },
    });
  }

  return variableNames;
};

const getNativeOidcSessionInputNodes = (document: DocumentNode) => {
  const inputNodes = new Set<ASTNode>();
  const nativeInputVariableNames = new Set<string>();

  // GraphQL validates unused fragments too. Collect their native input variables
  // from the whole document so malformed variable defaults cannot echo credentials.
  visit(document, {
    Field(node) {
      if (node.name.value !== 'exchangeNativeOidcSession') {
        return;
      }

      const input = node.arguments?.find((argument) => argument.name.value === 'input');
      if (input) {
        addAstNodes(input, inputNodes);
        for (const variableName of getNativeOidcSessionInputVariableNames([input])) {
          nativeInputVariableNames.add(variableName);
        }
      }
    },
  });

  visit(document, {
    VariableDefinition(node) {
      if (nativeInputVariableNames.has(node.variable.name.value)) {
        addAstNodes(node, inputNodes);
      }
    },
  });

  return inputNodes;
};

const isNativeOidcSessionInputValidationError = (
  error: unknown,
  nativeInputNodes: ReadonlySet<ASTNode>,
) =>
  error instanceof GraphQLError && error.nodes?.some((node) => nativeInputNodes.has(node)) === true;

const getNativeOidcSessionInputVariableNodes = (
  document: DocumentNode,
  operationName: string | undefined,
) => {
  const operation = getOperationAST(document, operationName);
  const variableNodes = new Set<ASTNode>();

  if (!operation) {
    return variableNodes;
  }

  const inputArguments = getNativeOidcSessionInputArguments(
    operation.selectionSet,
    getFragmentDefinitions(document),
  );
  const variableNames = getNativeOidcSessionInputVariableNames(inputArguments);
  for (const input of inputArguments) {
    addAstNodes(input.value, variableNodes);
  }

  for (const variableDefinition of operation.variableDefinitions ?? []) {
    if (variableNames.has(variableDefinition.variable.name.value)) {
      addAstNodes(variableDefinition, variableNodes);
    }
  }

  return variableNodes;
};

const transformError = (
  error: unknown,
  nativeInputVariableNodes: ReadonlySet<ASTNode> = new Set(),
): GraphQLError => {
  const graphQLError = error instanceof GraphQLError ? error : undefined;
  const kosmoError = unwrapKosmoError(error);

  if (kosmoError) {
    return new GraphQLError(kosmoError.message, {
      nodes: graphQLError?.nodes,
      source: graphQLError?.source,
      positions: graphQLError?.positions,
      path: graphQLError?.path,
      extensions: getKosmoErrorExtensions(kosmoError),
      originalError: kosmoError,
    });
  }

  // Variable coercion happens before the mutation resolver. Mask only this
  // public credential-exchange operation so malformed inputs cannot echo code
  // or token values while preserving other GraphQL validation diagnostics.
  if (graphQLError && isNativeOidcSessionInputError(graphQLError, nativeInputVariableNodes)) {
    return createValidationGraphQLError(graphQLError);
  }

  if (graphQLError && !graphQLError.originalError) {
    return graphQLError;
  }

  return createUnexpectedGraphQLError(error, graphQLError);
};

const transformExecutionResult = (
  result: ExecutionResult,
  nativeInputVariableNodes: ReadonlySet<ASTNode>,
): ExecutionResult => {
  if (!result.errors?.length) {
    return result;
  }

  return {
    ...result,
    errors: result.errors.map((error) => transformError(error, nativeInputVariableNodes)),
  };
};

export const useError = (): Plugin<UserContext> => ({
  onPluginInit: ({ registerContextErrorHandler }) => {
    registerContextErrorHandler(({ error, setError }) => {
      setError(transformError(error));
    });
  },
  onExecute: ({ args }) => {
    const nativeInputVariableNodes = getNativeOidcSessionInputVariableNodes(
      args.document,
      args.operationName,
    );

    return {
      onExecuteDone: ({ result, setResult }) => {
        if (isAsyncIterable(result)) {
          return {
            onNext: ({ result, setResult }) => {
              setResult(transformExecutionResult(result, nativeInputVariableNodes));
            },
          };
        }

        setResult(transformExecutionResult(result, nativeInputVariableNodes));
        return;
      },
    };
  },
  onValidate: ({ params }) => {
    const nativeInputNodes = getNativeOidcSessionInputNodes(params.documentAST);
    if (nativeInputNodes.size === 0) {
      return;
    }

    return ({ result, setResult }) => {
      setResult(
        result.map((error) =>
          isNativeOidcSessionInputValidationError(error, nativeInputNodes)
            ? createValidationGraphQLError(error)
            : error,
        ),
      );
    };
  },
});
