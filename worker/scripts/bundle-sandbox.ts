import * as esbuild from 'esbuild';
import { writeFileSync } from 'fs';

async function main() {
  console.log('Bundling sandbox agent...');

  const result = await esbuild.build({
    entryPoints: ['sandbox/src/agent.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    // External dependencies - these are installed in the sandbox container
    external: [
      '@anthropic-ai/claude-agent-sdk',
      '@supabase/supabase-js',
      'zod',
      'ws'
    ],
    write: false,
  });

  const bundledCode = result.outputFiles[0].text;

  writeFileSync(
    'src/sandbox-bundle.json',
    JSON.stringify({ 'agent.js': bundledCode }, null, 2)
  );

  console.log('Bundle written to src/sandbox-bundle.json');
  console.log(`Bundle size: ${(bundledCode.length / 1024).toFixed(2)} KB`);
}

main().catch(err => {
  console.error('Bundle failed:', err);
  process.exit(1);
});
