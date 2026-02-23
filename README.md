# Canvas SEB Quiz Creator

**LTI 1.3 tool for integrating Safe Exam Browser with Canvas LMS**

> Senior Design Project — CIS4914, University of Florida
> Team: Gators For Honor (Shane Downs & Wilson Goins)
> Advisor: Dr. Jeremiah Blanchard

---

## Project Summary

Instructors at UF who want to use Safe Exam Browser (SEB) for proctored exams in Canvas currently face a fragmented, error-prone workflow: they must create quizzes in Canvas, separately configure SEB using its config tool, generate encrypted config files, and manually distribute them to students. This tool eliminates that complexity.

The Canvas SEB Quiz Creator is an LTI 1.3 application that provides a unified wizard interface for creating Canvas quizzes pre-configured for SEB proctoring. It handles SEB configuration file generation, Config Key computation, and quiz creation through the Canvas API, all from within Canvas itself.

## Architecture

```
┌─────────────────┐     LTI 1.3 Launch      ┌──────────────────────┐
│   Canvas LMS    │ ──────────────────────►  │  SEB Exam Creator    │
│  (Docker local) │ ◄──────────────────────  │  (Node.js + ltijs)   │
│  localhost:3000  │     Quiz API calls       │  localhost:3001       │
└─────────────────┘                          └──────────┬───────────┘
                                                        │
                                              ┌─────────▼─────────┐
                                              │     MongoDB       │
                                              │  (Docker container)│
                                              │  localhost:27017   │
                                              └───────────────────┘
```

**Tech stack:** Node.js, Express (via ltijs), MongoDB, plist (XML generation), crypto (SHA-256 hashing)

## Daily Development Workflow

### Starting your dev environment

**Terminal 1 — Canvas (in your canvas-lms directory):**
```bash
cd C:\tmp\canvas     
docker compose up -d      # then you can open up http://localhost:3000 after it is up
```

**Terminal 2 — MongoDB (in the LTI tool directory):**
```bash
cd C:\tmp\LTI-Gators-for-Honor    
docker compose up -d mongo
```

**Terminal 3 — LTI Tool:**
```bash
cd C:\tmp\LTI-Gators-for-Honor
npm run dev       # this runs on http://localhost:3001, but there is nothing to see at that endpoint
```

### Testing the LTI launch

1. Go to `http://localhost:3000` and log into Canvas
2. Navigate to your test course
3. Click "SEB Exam Creator" in the left sidebar
4. You should see the LTI Launch Successful page

### Shutting down

```bash
# Stop the LTI tool in Terminal 3:
 Ctrl+C

# Stop MongoDB in Terminal 2:
cd C:\tmp\LTI-Gators-for-Honor
docker compose down

# Stop Canvas in terminal 1:
cd C:\tmp\canvas
docker compose down
```

Canvas and MongoDB data persist across restarts (stored in Docker volumes). You don't need to re-run database setup or asset compilation again.

## Environment Variables

See `.env.example` for the full template. Key variables:

## References

- [Canvas REST API](https://canvas.instructure.com/doc/api/)
- [Canvas New Quizzes API](https://canvas.instructure.com/doc/api/new_quizzes.html)
- [SEB Developer Docs](https://safeexambrowser.org/developer/overview.html)
- [SEB Config Key Spec](https://safeexambrowser.org/developer/seb-config-key.html)
- [SEB File Format Spec](https://safeexambrowser.org/developer/seb-file-format.html)
- [ltijs Documentation](https://cvmcosta.me/ltijs/)
- [LTI 1.3 Specification](https://www.imsglobal.org/spec/lti/v1p3/)