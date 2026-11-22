---
title: "About"
layout: about
description: "Who I am and what I have worked on."

# Everything below is fake, there to show the layout. Replace it with your own.
name: "Alex Example"
role: "Security engineer"
location: "Springfield"
links:
  - name: github
    url: https://github.com/3nabla3/
  - name: linkedin
    url: https://www.linkedin.com/in/3nabla3

skills:
  - group: languages
    items: [Python, C, Go, Rust, Bash]
  - group: offensive
    items: [Burp Suite, Nmap, Metasploit, Ghidra, GDB]
  - group: defensive
    items: [Wireshark, Zeek, Splunk, YARA, Sigma]

experience:
  - title: Senior security engineer
    org: Acme Corp
    when: "2022 – now"
    span: 4y
    bullets:
      - Led red-team exercises against the payments platform; 14 critical findings fixed within a quarter.
      - Built an internal fuzzing pipeline that found 9 memory-safety bugs before release.
      - Mentored four junior engineers through their first incident response.
  - title: Security analyst
    org: Initech
    when: "2019 – 2022"
    span: 3y
    bullets:
      - Wrote detection rules that cut false-positive alerts by 40%.
      - Ran the weekly vulnerability triage for 300+ hosts.
  - title: Software developer
    org: Globex
    when: "2017 – 2019"
    span: 2y
    bullets:
      - Maintained the backend of a logistics web app in Python and PostgreSQL.

education:
  - title: BSc Computer Science
    org: University of Fakeville
    when: "2013 – 2017"
    span: 4y
    bullets:
      - Thesis on side-channel attacks against embedded devices.

projects:
  - title: tcpscan
    url: https://example.com/tcpscan
    when: "2024"
    bullets:
      - A threaded TCP port scanner with banner grabbing, in under a hundred lines of Python.
  - title: crackme-solver
    when: "2023"
    bullets:
      - A small tool that recovers rolling-XOR licence keys from ELF binaries.
---
I break software for a living, and then help fix it. Most of my time goes to
**reverse engineering**, **fuzzing** and **incident response**, and I like
explaining what I learn along the way.

This blog is where the explanations end up, for example
[writing a port scanner in Python](/posts/port-scanner/). Outside work I play
CTFs and tinker with old hardware.
