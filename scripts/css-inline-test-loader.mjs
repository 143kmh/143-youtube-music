const EMPTY_CSS_MODULE = 'data:text/javascript,export default "";';

export async function resolve(specifier, context, nextResolve) {
  if (/\.css(?:\?inline)?$/u.test(specifier)) {
    return {
      url: EMPTY_CSS_MODULE,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}
