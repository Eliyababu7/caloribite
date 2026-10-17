import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import type * as TypeScript from "typescript";

// A small hook host for exercising actual component handlers without installing
// a native renderer. Native widgets and child components are adapter boundaries.
export function componentHarness(file: string, exportName: string, initialProps: Record<string, any>, adapters: Record<string, any>) {
  const ts = createRequire(resolve("package.json"))("typescript") as typeof TypeScript;
  const code = ts.transpileModule(readFileSync(resolve(file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const slots: any[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  const cleanups = new Map<number, () => void>();
  const hook = (initial: any) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (value: any) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  };
  const react = {
    useState: hook,
    useRef: (value: any) => hook(() => ({ current: value }))[0],
    useMemo: (factory: () => any, deps: any[]) => {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => dep !== slots[index].deps[i])) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useEffect: (effect: () => void | (() => void), deps?: any[]) => {
      const index = cursor++;
      if (!deps || !slots[index] || deps.some((dep, i) => dep !== slots[index][i])) effects.push(() => {
        cleanups.get(index)?.(); const cleanup = effect();
        if (cleanup) cleanups.set(index, cleanup);
      });
      slots[index] = deps;
    },
  };
  const modules = { ...adapters, react, "react/jsx-runtime": {
    jsx: (type: any, props: any) => ({ type, props }), jsxs: (type: any, props: any) => ({ type, props }),
  } };
  const exports: any = {};
  runInNewContext(code, { exports, require: (name: string) => {
    assert.ok(name in modules, `Unexpected component dependency ${name}`);
    return modules[name as keyof typeof modules];
  } });
  let props = initialProps;
  let tree: any;
  function render() {
    cursor = 0; tree = exports[exportName](props);
    const pending = effects; effects = []; pending.forEach((effect) => effect());
  }
  function nodes(node: any): any[] {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  render();
  return {
    render,
    async settle() { await new Promise((done) => setImmediate(done)); render(); },
    node: (type: string) => nodes(tree).find((node) => node.type === type),
    nodes: () => nodes(tree),
    input: (label: string) => nodes(tree).find((node) => node.type === "TextInput" && node.props.accessibilityLabel === label),
    button: (label: string) => nodes(tree).find((node) => node.type === "Pressable" && node.props.accessibilityLabel === label),
    text: () => nodes(tree).filter((node) => node.type === "Text").map((node) => node.props.children).join(" "),
    setProps(next: Record<string, any>) { props = { ...props, ...next }; render(); },
    dispose() { cleanups.forEach((cleanup) => cleanup()); },
  };
}
