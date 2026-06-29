---
description: Open a markdown file in the mdread app for reading/editing
argument-hint: <path-to-md-file>
allowed-tools: Bash(mdread:*)
---

Open the markdown file at `$ARGUMENTS` in the mdread desktop app:

```bash
mdread "$ARGUMENTS"
```

If `mdread` is not found, tell the user to install the CLI shim
(`cp cli/mdread /usr/local/bin/mdread`) and that mdread.app must be in
/Applications.
