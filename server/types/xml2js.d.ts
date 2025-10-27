declare module 'xml2js' {
  export interface ParserOptions {
    explicitArray?: boolean;
    [key: string]: any;
  }

  export function parseStringPromise(str: string, options?: ParserOptions): Promise<any>;
}
