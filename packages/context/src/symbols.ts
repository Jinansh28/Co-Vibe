import * as ts from 'typescript';

export interface SymbolInfo {
  name: string;
  type: 'function' | 'class' | 'type';
  line: number;
}

export class SymbolParser {
  parse(filePath: string, content: string): SymbolInfo[] {
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const symbols: SymbolInfo[] = [];

    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
        symbols.push({
          name: node.name.text,
          type: 'function',
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        });
      } else if (ts.isClassDeclaration(node) && node.name && isExported(node)) {
        symbols.push({
          name: node.name.text,
          type: 'class',
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        });
      } else if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name && isExported(node)) {
        symbols.push({
          name: node.name.text,
          type: 'type',
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        });
      }
      ts.forEachChild(node, visit);
    }

    function isExported(node: ts.Node): boolean {
      return (
        (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0
      );
    }

    visit(sourceFile);
    return symbols;
  }
}
