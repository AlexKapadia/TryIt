/**
 * @tryit/widget/dom — tiny, dependency-free DOM construction helpers.
 *
 * The render functions build real DOM trees (not HTML strings) so they are XSS-safe by
 * construction — text is set via `textContent`, never `innerHTML`, so untrusted copy or names
 * can never inject markup. These helpers keep `render.ts` declarative and under the size limit.
 */

/** Attribute/property bag accepted by {@link el}. */
export interface ElProps {
  readonly class?: string;
  readonly text?: string;
  /** ARIA + data + plain attributes, set via setAttribute (string values only). */
  readonly attrs?: Readonly<Record<string, string>>;
}

/**
 * Create an element with optional class, text content, attributes, and children. Text is set
 * with `textContent` (never `innerHTML`) so it cannot inject markup.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: readonly Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class !== undefined) {
    node.className = props.class;
  }
  if (props.text !== undefined) {
    node.textContent = props.text;
  }
  if (props.attrs !== undefined) {
    for (const [key, value] of Object.entries(props.attrs)) {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) {
    node.appendChild(child);
  }
  return node;
}

/** Create a `<button>` with a stable `data-action` hook the element delegates click events from. */
export function button(
  action: string,
  label: string,
  props: ElProps = {},
): HTMLButtonElement {
  const merged: ElProps = {
    ...props,
    attrs: { type: 'button', 'data-action': action, ...(props.attrs ?? {}) },
  };
  const node = el('button', merged);
  node.textContent = label;
  return node;
}
