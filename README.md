# 🌿 understory

**understory is an AI-assisted reading companion that makes complex literature more accessible in real time.**

Inspired by the literacy crisis and the reality that the average reading level in the United States is around seventh grade, understory was built to help readers feel confident engaging with challenging texts without replacing the reading experience.

---

## ✨ What It Does

understory supports readers as they move through difficult passages.

When a user highlights a portion of text:

* A structured explanation is generated instantly
* Character dynamics are clarified
* Themes are identified
* Emotional tone is unpacked
* Literary devices are explained

Users can also activate an interactive analysis mode that provides deeper exploration of:

* Character relationships
* Emerging themes
* Emotional arcs
* Literary techniques

To further enhance accessibility, explanations can be played aloud using integrated text-to-speech.

Rather than functioning as a chatbot, understory delivers layered, structured insights that support comprehension while keeping the focus on the text itself.

---

## 🧠 How It Works

understory is built using an agent-based architecture powered by the **Gemini API**.

When text is highlighted:

* Structured prompts are sent to Gemini
* Specialized analysis layers generate focused literary explanations
* Outputs are constrained for clarity and accessibility

We designed distinct analytical components for:

* Character analysis
* Theme modeling
* Literary device recognition

For multimodal accessibility, we integrated **ElevenLabs** to convert explanations into expressive, natural-sounding audio directly within the pop-up interface.

The application is built as a desktop experience using:

* Electron
* JavaScript
* HTML
* CSS

---

## 🌍 Why It Matters

Many readers want to engage with complex literature but feel intimidated by dense language or academic-style analysis.

understory lowers those barriers by:

* Supporting readers in real time
* Maintaining ownership of the reading experience
* Providing structured, accessible explanations
* Offering optional auditory support

Our mission is not to summarize literature, but to empower readers to explore it confidently.

---

## 🚀 Running the Project

Clone the repository:

```bash
git clone https://github.com/yubelgg/hopperhacks-electron.git
```

Install dependencies:

```bash
npm install
```

Start the application:

```bash
npm start
```

---

## 🔮 What's Next

Future improvements include:

* Adaptive reading-level adjustments
* Adjustable text-to-speech voice and pacing
* Expanded visualizations of themes and emotional arcs
* Deeper personalization

Long term, we envision understory as a platform that empowers readers of all backgrounds to engage confidently with complex literature.

---

## 🏗 Built With

* Gemini API
* ElevenLabs
* Electron
* JavaScript
* HTML
* CSS
