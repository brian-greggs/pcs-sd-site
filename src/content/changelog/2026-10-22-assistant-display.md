---
date: 2026-10-22
title: The assistant's answers read cleanly and list only their sources
version: v0.7.5
---

- **Fixed, not yet public:** answers from the assistant showed formatting marks as raw asterisks. Bold, short lists and links to this site's pages now display as formatting; anything else stays plain text.
- **Fixed:** answers ended with a row of web addresses in parentheses, repeating the list of pages under them. An answer now names each section it uses in a few words, like "(Santee: Cost)", and the list under it carries the links and the dates each section was checked.
- **Fixed:** the list under an answer showed every section the assistant was given, including ones it didn't use. It now shows only the sections the answer names. When the assistant can't answer, it shows the nearest page.
- **Why:** the first test of the assistant with a real AI model turned these up. The test also checks for them now, and it reports how long answers take and what a test run costs.
