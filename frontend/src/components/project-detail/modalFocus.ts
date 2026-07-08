const MODAL_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(",");

export function focusableModalElements(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR),
  ).filter((element) => {
    const isHidden = element.getAttribute("aria-hidden") === "true";
    const isDisabled = element.hasAttribute("disabled");
    return !isHidden && !isDisabled && element.getClientRects().length > 0;
  });
}
