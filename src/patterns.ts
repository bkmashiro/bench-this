export const BENCH_PATTERN = /\/\/\s*@bench([^\n]*)\n\s*((?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\()/gm

export const PY_BENCH_PATTERN = /#\s*@bench([^\n]*)\n\s*(?:async\s+)?def\s+(\w+)/gm
