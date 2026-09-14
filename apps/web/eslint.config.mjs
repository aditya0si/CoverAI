import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // React Compiler readiness rules newly enabled by eslint-config-next 16.
      // This app does not enable the React Compiler, so surface pre-existing
      // intentional patterns (localStorage hydration, derived default selection,
      // Date.now() in render) as warnings instead of hard CI failures.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
];

export default eslintConfig;
