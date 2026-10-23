---
date: 2026-10-22
title: The assistant starts where the move starts
version: v0.7.6
---

- **Fixed, not yet public:** asked "what do I do first after I get orders?", the assistant answered from later steps (household goods counseling, PPM approval) because nothing in the question matched the first steps' words. Questions about where to start now always get the first three steps on the Orders page: read your orders in full, don't book the move before official orders, and request a sponsor.
- **Fixed:** when the assistant named part of a section ("Rancho Bernardo: Cost › Buying"), the list under the answer didn't recognize it and showed every section instead. Each section now has one name, parts included.
- **Why:** the first test with a real AI model showed it. Three more test questions ask the same thing in other words, and the test's own checks now accept a number written as a word, tell rent from the housing allowance, and recognize more ways of saying "that isn't covered".
