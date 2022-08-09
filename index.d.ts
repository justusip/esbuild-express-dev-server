import express from "express";
import { BuildOptions } from "esbuild";
export default function DevServer(options: Omit<BuildOptions, "incremental" | "banner" | "write" | "watch">, root: string, injectPaths: string[]): (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>;
