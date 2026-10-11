---
date: 2026-10-11
title: Groundwork for an assistant that answers only from these pages
version: v0.5.1
---

- **Added, not yet public:** the groundwork for an assistant. Every page is split into its dated sections; a question is matched to the sections that answer it, and the answer has to come from those sections, cite them and show their dates. When nothing on the site answers it, the reply is "I don't have that in the San Diego material" and the nearest page. It's not linked from anywhere and no AI model is connected yet, so it only shows which sections it would use.
- **Rules it follows:** it never gives the housing allowance in dollars (a filter on the server removes any dollar figure next to "BAH" or "housing allowance"), never describes a place by who lives there, never calls a place safe or unsafe, never names a realtor, lender, mover or landlord, and says plainly where our data has a hole (small in-home child care, air conditioning, base housing wait times).
- **Privacy:** questions will go to an AI model to be answered; this site doesn't store them or log them. The conversation lives in your browser tab and is gone when you close it. Starting-plan answers are sent only if you turn that on, and the page shows exactly what will be sent first.
- **Why:** the assistant is built last on purpose, so it can't get ahead of the material. This is the part we can test before switching it on: a set of 36 test questions, including ones it should refuse.
