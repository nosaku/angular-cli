/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import type { BuildOptions, OutputFile } from 'esbuild';
import * as path from 'node:path';
import { createCssResourcePlugin } from './css-resource-plugin';
import { bundle } from './esbuild';
import { createSassPlugin } from './sass-plugin';

export interface BundleStylesheetOptions {
  workspaceRoot: string;
  optimization: boolean;
  preserveSymlinks?: boolean;
  sourcemap: boolean | 'external' | 'inline';
  outputNames?: { bundles?: string; media?: string };
  includePaths?: string[];
  externalDependencies?: string[];
  target: string[];
}

export function createStylesheetBundleOptions(
  options: BundleStylesheetOptions,
  inlineComponentData?: Record<string, string>,
): BuildOptions & { plugins: NonNullable<BuildOptions['plugins']> } {
  return {
    absWorkingDir: options.workspaceRoot,
    bundle: true,
    entryNames: options.outputNames?.bundles,
    assetNames: options.outputNames?.media,
    logLevel: 'silent',
    minify: options.optimization,
    sourcemap: options.sourcemap,
    outdir: options.workspaceRoot,
    write: false,
    platform: 'browser',
    target: options.target,
    preserveSymlinks: options.preserveSymlinks,
    external: options.externalDependencies,
    conditions: ['style', 'sass'],
    mainFields: ['style', 'sass'],
    plugins: [
      createSassPlugin({
        sourcemap: !!options.sourcemap,
        loadPaths: options.includePaths,
        inlineComponentData,
      }),
      createCssResourcePlugin(),
    ],
  };
}

/**
 * Bundles a component stylesheet. The stylesheet can be either an inline stylesheet that
 * is contained within the Component's metadata definition or an external file referenced
 * from the Component's metadata definition.
 *
 * @param identifier A unique string identifier for the component stylesheet.
 * @param language The language of the stylesheet such as `css` or `scss`.
 * @param data The string content of the stylesheet.
 * @param filename The filename representing the source of the stylesheet content.
 * @param inline If true, the stylesheet source is within the component metadata;
 * if false, the source is a stylesheet file.
 * @param options An object containing the stylesheet bundling options.
 * @returns An object containing the output of the bundling operation.
 */
export async function bundleComponentStylesheet(
  identifier: string,
  language: string,
  data: string,
  filename: string,
  inline: boolean,
  options: BundleStylesheetOptions,
) {
  const namespace = 'angular:styles/component';
  const entry = [namespace, language, identifier, filename].join(';');

  const buildOptions = createStylesheetBundleOptions(options, { [entry]: data });
  buildOptions.entryPoints = [entry];
  buildOptions.plugins.push({
    name: 'angular-component-styles',
    setup(build) {
      build.onResolve({ filter: /^angular:styles\/component;/ }, (args) => {
        if (args.kind !== 'entry-point') {
          return null;
        }

        if (inline) {
          return {
            path: args.path,
            namespace,
          };
        } else {
          return {
            path: filename,
          };
        }
      });
      build.onLoad({ filter: /^angular:styles\/component;css;/, namespace }, async () => {
        return {
          contents: data,
          loader: 'css',
          resolveDir: path.dirname(filename),
        };
      });
    },
  });

  // Execute esbuild
  const result = await bundle(options.workspaceRoot, buildOptions);

  // Extract the result of the bundling from the output files
  let contents = '';
  let map;
  let outputPath;
  const resourceFiles: OutputFile[] = [];
  if (result.outputFiles) {
    for (const outputFile of result.outputFiles) {
      const filename = path.basename(outputFile.path);
      if (filename.endsWith('.css')) {
        outputPath = outputFile.path;
        contents = outputFile.text;
      } else if (filename.endsWith('.css.map')) {
        map = outputFile.text;
      } else {
        // The output files could also contain resources (images/fonts/etc.) that were referenced
        resourceFiles.push(outputFile);
      }
    }
  }

  return {
    errors: result.errors,
    warnings: result.warnings,
    contents,
    map,
    path: outputPath,
    resourceFiles,
  };
}
