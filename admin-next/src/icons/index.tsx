// 图标统一从此导出。组件定义见 ./generated.tsx（由 .svg 经 @svgr/core 转换的内联组件），
// 不再依赖 @svgr/webpack —— 本机 Turbopack 的 webpack-loader worker 进程会崩溃，
// 而 @svgr/webpack 走该 worker，故改为零 worker 依赖的内联组件。
export * from "./generated";
