// Small helpers so the chapters of the manual read as plain lists of blocks.
export const h3 = (text) => ({ type: "h3", text });
export const h4 = (text) => ({ type: "h4", text });
export const p = (text) => ({ type: "p", text });
export const ul = (...items) => ({ type: "ul", items });
export const steps = (...items) => ({ type: "ol", items });
export const fig = (img, caption, legend, extra = {}) => ({ type: "fig", img, caption, legend, ...extra });
export const row = (...items) => ({ type: "row", items });
export const table = (head, ...rows) => ({ type: "table", head, rows });
export const flow = (...steps) => ({ type: "flow", steps });
export const permTable = (head) => ({ type: "perms", head });
export const callout = (type, label) => (text) => ({ type, label, text });
