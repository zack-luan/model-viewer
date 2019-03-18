export interface FunctionNode {
  type: 'function';
  name: string|null;
  args: Array<ValueNode>;
}

export interface ValueNode {
  type: 'value';
  value: string|number|null;
  unit: string|null;
}

/**
 * Parses input strings that map to a subset of what is considered a valid CSS
 * expression containing only function terms. Function terms are considered to
 * have the following qualities:
 *
 *  - A name. Ex: translate3D
 *  - Zero or more arguments wrapped in parens. Ex: translate3D(0px, 2px, 5px)
 *  - Arguments are separated by commas
 *  - Numeric arguments can have a unit
 *  - Non-numeric arguments should start with a non-number, non-hyphen character
 *  - There may be more than one function term. If there is, all terms should
 *    be separated by whitespace
 *
 * The result of parsing is an AST that maps to this template:
 *
 * [
 *   {
 *     type: 'function',
 *     name,
 *     args: [
 *       {
 *         type: 'value',
 *         value,
 *         unit
 *       },
 *       ...
 *     ]
 *   },
 *   ...
 * ]
 *
 * This parser aims to trade correctness for speed and code size reduction in
 * all possible cases. It tries to parse forgivingly, so sometimes values will
 * be substituted with null (an alternative to throwing when encountering
 * unexpected syntax). The parser makes no attempt to perform validation on
 * values, so the burden is on the user of the parser to ensure that function
 * names and arguments align with what they expect.
 *
 * Some example valid input strings include:
 *
 *  - translateX(100px) scale(2) rotate3D(10deg, -10deg, 0)
 *  - origin(scene)
 *  - url("http://www.google.com")
 *  - empty()
 *
 * One current limitation is that the parser aggressively removes whitespace. So
 * if a function expects long string values (like the native url function), the
 * string values should be pre-encoded.
 */
export const parseFunctions = (expressionString:
                                   string): Array<FunctionNode> => {
  return extractFunctions(expressionString)
      .map(atomicFunctionString => parseAtomicFunction(atomicFunctionString));
};

/**
 * Parses input strings that are a series of whitespace-separated CSS-like value
 * expressions. Expressions in such strings include values such as:
 *
 *  - A color e.g., red or #8800ff
 *  - A named orientation e.g., center
 *  - A length e.g., 25px or 1m
 *
 * Some example value strings:
 *
 *  - 0 10px 100px
 *  - red green 100%
 *  - 180deg 90deg
 */
export const parseValues = (valuesString: string): Array<ValueNode> => {
  return whitespaceSplit(valuesString)
      .map(valueString => parseAtomicValue(valueString));
};

const parseAtomicFunction = (atomicFunctionString: string): FunctionNode => {
  const name = extractFunctionName(atomicFunctionString);
  const args = extractFunctionArgs(atomicFunctionString)
                   .map(arg => parseAtomicValue(arg));

  return {type: 'function', name, args};
};

const parseAtomicValue = (valueString: string): ValueNode => {
  const value = extractArgValue(valueString);
  const unit = value != null ? valueString.replace(value, '') : null;

  return {type: 'value', value, unit};
};

const extractArgValue = (() => {
  const ARG_VALUE_RE = /^(([#]?[^-^.^0-9].*)|([-]?[0-9.]+))/;

  return (inputString: string): string|null => {
    const match = inputString.match(ARG_VALUE_RE);
    return match ? match[0] : null;
  };
})();

const extractFunctions = (() => {
  const ATOMIC_FUNCTION_RE = /[^\(]+\(\s*([^\)]*)\)/g;
  const WHITESPACE_RE = /\s/g;

  return (inputString: string): Array<string> => {
    const atomicFunctions = inputString.match(ATOMIC_FUNCTION_RE) || [];
    return atomicFunctions.map(
        atomicFunction => atomicFunction.replace(WHITESPACE_RE, ''));
  };
})();

const extractFunctionName = (() => {
  const FUNCTION_NAME_RE = /^[^\(]+/g;

  return (inputString: string): string|null => {
    const match = inputString.match(FUNCTION_NAME_RE);
    return match ? match[0] : null;
  };
})();

const extractFunctionArgs = (() => {
  const FUNCTION_ARGS_RE = /[^,^\)]+/g;

  return (inputString: string): Array<string> => {
    const argBodyIndex = inputString.indexOf('(');
    if (argBodyIndex === -1) {
      return [];
    }
    const argBody = inputString.slice(argBodyIndex + 1);

    return argBody.match(FUNCTION_ARGS_RE) || [];
  };
})();

const whitespaceSplit = (() => {
  const WHITESPACE_RE = /\s/g;

  return (inputString: string) => {
    if (!inputString) {
      return [];
    }

    return inputString.split(WHITESPACE_RE);
  };
})();
