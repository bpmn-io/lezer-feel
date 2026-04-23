import {
  VariableContext
} from '@bpmn-io/lezer-feel';


/**
 * @typedef { { entries?: Record<string, any>, [key: string]: any } } EntriesContextValue
 */


/**
 * A context that holds multiple alternative shape variants,
 * preserving distinct shapes instead of merging them.
 *
 * Created when `EntriesContext.of()` is called with multiple values.
 */
class UnionContext extends VariableContext {

  /**
   * @param { VariableContext[] } variants
   */
  constructor(variants) {
    super({});
    this.variants = variants;
  }

  /**
   * Return all keys available across all variants.
   *
   * @returns {string[]}
   */
  getKeys() {
    const allKeys = new Set();
    for (const variant of this.variants) {
      for (const key of variant.getKeys()) {
        allKeys.add(key);
      }
    }
    return [ ...allKeys ];
  }

  /**
   * Return value for the given key, searching across all variants.
   * If multiple variants have the key, returns a new UnionContext of those values.
   *
   * @param {string} key
   * @returns {VariableContext|null}
   */
  get(key) {
    const results = [];
    for (const variant of this.variants) {
      const val = variant.get(key);
      if (val != null) {
        results.push(val);
      }
    }

    if (results.length === 0) {
      return null;
    }

    if (results.length === 1) {
      return results[0];
    }

    // Multiple variants provide this key — return a union of those values
    return new UnionContext(results.map(r =>
      r instanceof VariableContext ? r : new EntriesContext(EntriesContext.__unwrap(r))
    ));
  }

  /**
   * Add a key as a new variant entry.
   *
   * @param {string} key
   * @param {any} value
   * @returns {UnionContext}
   */
  set(key, value) {
    return new UnionContext([ ...this.variants, new VariableContext({ [key]: value }) ]);
  }
}


/**
 * An alternative context that holds additional meta-data
 */
export class EntriesContext extends VariableContext {

  /**
   * @param {EntriesContextValue} value
   */
  constructor(value = { entries: {} }) {
    super(value);

    const entries = this.value.entries = this.value.entries || {};

    for (const [ key, entry ] of Object.entries(entries)) {
      if (entry instanceof EntriesContext) {
        continue;
      }

      entries[key] = EntriesContext.of(entry);
    }
  }

  getKeys() {
    return Object.keys(this.value.entries);
  }

  get(key) {
    const value = this.value.entries[key];

    if (!value) {
      return value;
    }

    const atomicValue = value?.value.atomicValue;

    // keep value producer
    if (atomicValue?.fn) {
      return atomicValue;
    }

    return value;
  }

  /**
   * @param {string} key
   * @param {any} value
   *
   * @return {this}
   */
  set(key, value) {

    const constructor = /** @type { typeof EntriesContext } */ (this.constructor);

    return /** @type {this} */ (constructor.of(
      {
        ...this.value,
        entries: {
          ...this.value.entries,
          [key]: value
        }
      }
    ));
  }

  /**
   * @param { EntriesContext | EntriesContextValue | Record<string, any> } context
   *
   * @return { EntriesContextValue }
   */
  static __unwrap(context) {

    if (this.isAtomic(context)) {
      return context instanceof this
        ? context.value
        : { atomicValue: context };
    }

    return context;
  }

  /**
   * Create a context from one or more values.
   *
   * When called with multiple non-nil values, returns a UnionContext that preserves
   * each variant's distinct shape instead of merging them.
   * When called with zero or one non-nil value, uses the original merge-based
   * behavior for backward compatibility.
   *
   * @param { ...(VariableContext | EntriesContextValue | any) } contexts
   * @returns { EntriesContext | UnionContext }
   */
  static of(...contexts) {
    const nonEmpty = contexts.filter(c => c != null);

    if (nonEmpty.length > 1) {

      // Multiple non-nil values: create a union context preserving each variant's shape
      const variants = nonEmpty.map(c =>
        c instanceof VariableContext ? c : new this(this.__unwrap(c))
      );

      return new UnionContext(variants);
    }

    // Zero or one non-nil value: use original merge-based behavior
    // (preserves atomicValue propagation and context normalization)

    // Special case: return a single UnionContext as-is to avoid
    // destroying its variant structure during merge
    if (nonEmpty.length === 1 && nonEmpty[0] instanceof UnionContext) {
      return nonEmpty[0];
    }

    const merged = contexts.reduce((ctx, otherCtx) => {
      return this.__merge(ctx, otherCtx);
    }, {});

    return new this(merged);
  }

  /**
   * @param { EntriesContextValue } context
   * @param { EntriesContextValue} other
   *
   * @return { EntriesContextValue }
   */
  static __merge(context, other) {

    const {
      entries: contextEntries = {},
      ...contextRest
    } = this.__unwrap(context);

    const {
      entries: otherEntries = {},
      ...otherRest
    } = this.__unwrap(other);

    // @ts-ignore "access to internals"
    const mergedEntries = super.__merge(contextEntries, otherEntries);

    return {
      ...contextRest,
      ...otherRest,
      entries: mergedEntries
    };
  }
}


export function toEntriesContextValue(context) {

  return context && Object.keys(context).reduce((result, key) => {
    const value = context[key];

    result.entries[key] = typeof value === 'object' ? toEntriesContextValue(value)
      : value;

    return result;
  }, { entries: {} });
}