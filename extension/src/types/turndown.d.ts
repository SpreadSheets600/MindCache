declare module 'turndown' {
  interface TurndownServiceOptions {
    headingStyle?: 'setext' | 'atx';
    hr?: string;
    br?: string;
    bulletListMarker?: '-' | '+' | '*';
    codeBlockStyle?: 'indented' | 'fenced';
    emDelimiter?: '_' | '*';
    fence?: string;
    strongDelimiter?: '__' | '**';
    linkStyle?: 'inlined' | 'referenced';
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut';
    preformattedCode?: boolean;
  }

  interface TurndownRule {
    filter: string | string[] | ((node: HTMLElement, options: TurndownServiceOptions) => boolean);
    replacement: (content: string, node: HTMLElement, options: TurndownServiceOptions) => string;
  }

  class TurndownService {
    constructor(options?: TurndownServiceOptions);
    turndown(html: string | HTMLElement): string;
    addRule(key: string, rule: TurndownRule): this;
    keep(filter: string | string[]): this;
    remove(filter: string | string[]): this;
    use(plugin: (service: TurndownService) => void): this;
    escape(str: string): string;
  }

  export default TurndownService;
}
