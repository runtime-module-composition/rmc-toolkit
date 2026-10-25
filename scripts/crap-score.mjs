#!/usr/bin/env node
// Computes a CRAP score (Change Risk Anti-Patterns) per function:
//   CRAP(f) = complexity(f)^2 * (1 - coverage(f))^3 + complexity(f)
// complexity = cyclomatic complexity (decision points + 1).
// coverage   = fraction of that function's own statements hit at least once,
//              from vitest's v8/istanbul coverage-final.json.
//
// Scope: packages/core/src only (the toolkit's framework-agnostic core).

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import ts from "typescript";

const ROOT = resolve(import.meta.dirname, "..");
const CORE_SRC = resolve(ROOT, "packages/core/src");
const COVERAGE_FILE = resolve(ROOT, "coverage/coverage-final.json");

const DECISION_POINT_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
]);

const isFunctionLike = (node) =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isGetAccessor(node) ||
  ts.isSetAccessor(node) ||
  ts.isConstructorDeclaration(node);

const nameOfFunction = (node, sourceFile) => {
  if (node.name) return node.name.getText(sourceFile);
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && parent.name) {
    return parent.name.getText(sourceFile);
  }
  if (parent && ts.isPropertyAssignment(parent) && parent.name) {
    return parent.name.getText(sourceFile);
  }
  return "<anonymous>";
};

const lineOf = (sourceFile, pos) => sourceFile.getLineAndCharacterOfPosition(pos).line + 1;

const collectFunctions = (sourceFile) => {
  const functions = [];

  const visit = (node) => {
    if (isFunctionLike(node) && node.body) {
      functions.push({
        name: nameOfFunction(node, sourceFile),
        startLine: lineOf(sourceFile, node.getStart(sourceFile)),
        endLine: lineOf(sourceFile, node.getEnd()),
        complexity: complexityOf(node, sourceFile),
      });
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return functions;
};

// Walks a function's own body, counting decision points, but does NOT
// descend into a nested function-like node — that nested function is
// visited (and scored) separately as its own entry, so its branches must
// not also inflate the enclosing function's complexity.
const complexityOf = (fnNode, sourceFile) => {
  let complexity = 1;

  const visit = (node) => {
    if (node !== fnNode && isFunctionLike(node)) return;

    if (DECISION_POINT_KINDS.has(node.kind)) {
      complexity += 1;
    }
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      complexity += 1;
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(fnNode, visit);
  return complexity;
};

// Attributes each covered statement to the innermost function whose
// [startLine, endLine] contains it, so a statement inside a nested closure
// counts toward that closure's coverage, not its enclosing function's.
const coverageOf = (functions, fileCoverage) => {
  const statements = Object.entries(fileCoverage.statementMap).map(([id, loc]) => ({
    line: loc.start.line,
    hit: fileCoverage.s[id] > 0,
  }));

  for (const fn of functions) {
    fn.totalStatements = 0;
    fn.coveredStatements = 0;
  }

  for (const stmt of statements) {
    let innermost = null;
    for (const fn of functions) {
      if (stmt.line < fn.startLine || stmt.line > fn.endLine) continue;
      if (!innermost || fn.endLine - fn.startLine < innermost.endLine - innermost.startLine) {
        innermost = fn;
      }
    }
    if (!innermost) continue;
    innermost.totalStatements += 1;
    if (stmt.hit) innermost.coveredStatements += 1;
  }
};

const crapScore = (complexity, coverageRatio) =>
  complexity ** 2 * (1 - coverageRatio) ** 3 + complexity;

const main = () => {
  console.log("Running coverage over packages/core...\n");
  execSync(
    "npx vitest run --dir packages/core --coverage --coverage.reporter=json --coverage.reportsDirectory=coverage",
    { cwd: ROOT, stdio: "inherit" },
  );

  const coverage = JSON.parse(readFileSync(COVERAGE_FILE, "utf8"));
  const results = [];

  for (const [filePath, fileCoverage] of Object.entries(coverage)) {
    if (!filePath.startsWith(CORE_SRC)) continue;
    if (filePath.endsWith(".test.ts") || filePath.includes("__fixtures__")) continue;

    const source = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
    const functions = collectFunctions(sourceFile);
    coverageOf(functions, fileCoverage);

    for (const fn of functions) {
      const coverageRatio = fn.totalStatements === 0 ? 1 : fn.coveredStatements / fn.totalStatements;
      results.push({
        file: relative(ROOT, filePath),
        name: fn.name,
        line: fn.startLine,
        complexity: fn.complexity,
        coveragePct: Math.round(coverageRatio * 100),
        crap: Math.round(crapScore(fn.complexity, coverageRatio) * 10) / 10,
      });
    }
  }

  results.sort((a, b) => b.crap - a.crap);

  const col = (s, w) => String(s).padEnd(w);
  console.log("\nCRAP score per function (packages/core/src), highest risk first:\n");
  console.log(
    col("CRAP", 8) + col("Complexity", 12) + col("Coverage", 10) + col("Line", 6) + "Function (file)",
  );
  console.log("-".repeat(80));
  for (const r of results) {
    const flag = r.crap > 30 ? " ⚠" : "";
    console.log(
      col(r.crap, 8) +
        col(r.complexity, 12) +
        col(`${r.coveragePct}%`, 10) +
        col(r.line, 6) +
        `${r.name} (${r.file})${flag}`,
    );
  }

  const highRisk = results.filter((r) => r.crap > 30);
  console.log(`\n${highRisk.length} function(s) above CRAP 30 (the conventional "risky" threshold).`);
};

main();
