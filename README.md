# Blindspot

An AI thinking partner for decisions. You describe a decision and your reasoning. Blindspot shows what the reasoning leaves out, what it quietly assumes, and where it pulls against itself. It asks questions. It never recommends an option.

## The problem it addresses

People decide using the information most visible to them. They overlook factors, lean on unstated assumptions, and miss conflicts in their own logic. Blindspot helps a person examine a decision more critically without deciding for them.

## How it works

1. The user fills in three fields: the decision, what they know about the options, and why they lean the way they do. Separating details from reasons lets the model compare what the person knows with what they actually weighed.
2. One model call returns a stream of JSON lines. The page renders each line as it arrives:
   - **Brief**: a short spoken-style summary with no verdict
   - **What you are weighing**: reasons given vs. facts mentioned but not weighed
   - **Overlooked factors**: things relevant to the decision that nothing in the text mentions
   - **Assumptions to test**: beliefs treated as facts
   - **Tensions**: places where the person's goals and reasons conflict
   - **Questions to sit with**
3. Every point has a "Think it through" button that opens a short dialogue. Replies reflect what the person just revealed and end with one question. "Recap my thinking" summarizes without picking a side.
4. Voice replies use the browser's speech synthesis, and dictation uses speech recognition where the browser allows it.

## Staying neutral

- The prompt forbids recommendations, comparisons of which option is better, and "you should".
- Every output is scanned for advice-like phrases. Matches are flagged on screen and counted in the "Advice-like phrases" stat next to the orb.
- If a person asks "what should I do?", the assistant says the call is theirs and offers a way to structure it.
- If the text involves harm to the person or someone else, the assistant responds with care and points to someone they trust.

## Project layout

```
index.html        The whole front end (HTML, CSS, JS, no build step)
api/claude.js     Serverless proxy that holds the API key and streams the model's reply
server.js         Dependency-free local server for development
.env.example      Environment variables
```

## Run locally

Needs Node 18 or newer and an Anthropic API key.

```bash
cp .env.example .env      # then paste your key after ANTHROPIC_API_KEY=
node server.js
```

Open http://localhost:3000.

## Deploy (Vercel, from GitHub)

1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New Project** and import the repository. No build settings are needed.
3. Under **Settings, Environment Variables**, add `ANTHROPIC_API_KEY`.
4. Deploy. Every push to the main branch redeploys.

The proxy limits request size and output length and applies a per-IP rate limit, but serverless instances do not share memory, so the limit is only a speed bump. Set a monthly spend limit on your Anthropic key. If you want to restrict who can call it, set `ALLOWED_ORIGIN` to your site's address.

GitHub Pages alone is not enough. It only serves static files, so the analysis would have no backend to call. The page would still show its built-in example.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Your API key (required) | none |
| `MODEL_DEFAULT` | Model for the full analysis | `claude-sonnet-5-5` |
| `MODEL_QUICK` | Model for dialogue replies | `claude-haiku-4-5-20251001` |
| `RATE_LIMIT` | Requests per IP per 10 minutes | `30` |
| `ALLOWED_ORIGIN` | Reject calls from other origins | unset |

## Demo script

1. Open the page. It starts on a pre-written internship example, marked as such.
2. Press **Analyse my reasoning**. Watch the sections stream in.
3. Press **Think it through** on "Collision with your exams" and answer in the dialogue.
4. Ask "so should I take it?" and note that it declines and offers a way to structure the choice.
5. Load **Moving cities** or **New laptop** to show it generalizes beyond internships.

## Limitations

- It only knows what the person types. It can miss context or raise a point that does not apply, so each item is framed as something to check.
- The advice-phrase check is a pattern match, so it can miss a subtle verdict and can flag a harmless sentence.
- Voice input depends on browser support and microphone permission.
