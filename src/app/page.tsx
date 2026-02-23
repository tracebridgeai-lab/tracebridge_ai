"use client";

import Link from "next/link";
import {
  Shield,
  FileSearch,
  BarChart3,
  ArrowRight,
  Sparkles,
  Database,
  Brain,
  CheckCircle2,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-7 h-7 text-[var(--primary)]" />
            <span className="text-lg font-bold gradient-text">TraceBridge AI</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-[var(--muted)]">
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-white transition-colors">
              How It Works
            </a>
            <a href="#standards" className="hover:text-white transition-colors">
              Standards
            </a>
          </nav>
          <Link href="/dashboard" className="btn-primary text-sm flex items-center gap-2">
            Launch App <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/20 text-sm text-[var(--primary)]">
            <Sparkles className="w-4 h-4" />
            Powered by Google Gemini AI
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Regulatory Gap
            <br />
            <span className="gradient-text">Detection Engine</span>
          </h1>
          <p className="text-lg md:text-xl text-[var(--muted)] mb-10 max-w-2xl mx-auto leading-relaxed">
            Upload your medical device V&V documentation. TraceBridge AI
            identifies compliance gaps across IEC 62304, ISO 14971, and ISO
            13485 — with AI-powered citations from your actual documents.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/dashboard/upload"
              className="btn-primary text-lg px-8 py-4 flex items-center justify-center gap-2"
            >
              Start Analysis <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/dashboard"
              className="btn-secondary text-lg px-8 py-4 flex items-center justify-center gap-2"
            >
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">
              Three-Layer Gap Detection
            </h2>
            <p className="text-[var(--muted)] max-w-lg mx-auto">
              Deterministic rules meet semantic AI for comprehensive compliance
              analysis.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="glass-card p-8 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center mb-5">
                <Database className="w-6 h-6 text-[var(--primary)]" />
              </div>
              <h3 className="text-xl font-semibold mb-3">
                Step A: Rule Engine
              </h3>
              <p className="text-[var(--muted)] text-sm leading-relaxed">
                153+ compliance rules from IEC 62304, ISO 14971, and ISO 13485
                stored in PostgreSQL. Deterministic — no guessing.
              </p>
            </div>
            <div className="glass-card p-8 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center mb-5">
                <Brain className="w-6 h-6 text-[var(--accent)]" />
              </div>
              <h3 className="text-xl font-semibold mb-3">
                Step B: Gemini Search
              </h3>
              <p className="text-[var(--muted)] text-sm leading-relaxed">
                For each rule, Gemini File Search scans your uploaded documents
                for evidence. Returns citations with exact quotes.
              </p>
            </div>
            <div className="glass-card p-8 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-[var(--success)]/10 flex items-center justify-center mb-5">
                <CheckCircle2 className="w-6 h-6 text-[var(--success)]" />
              </div>
              <h3 className="text-xl font-semibold mb-3">
                Step C: Gap Verdict
              </h3>
              <p className="text-[var(--muted)] text-sm leading-relaxed">
                Combines deterministic rules with semantic results. No evidence
                found? Gap. Partial? Needs review. Full evidence? Compliant.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-6 border-t border-[var(--border)]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">How It Works</h2>
          <div className="space-y-8">
            {[
              {
                num: "01",
                title: "Upload Documents",
                desc: "Upload your V&V packages, test protocols, design documents, and risk analyses as PDF or DOCX files.",
                icon: FileSearch,
              },
              {
                num: "02",
                title: "Select Standards",
                desc: "Choose which regulatory standards to check against — IEC 62304 (Software), ISO 14971 (Risk), ISO 13485 (QMS).",
                icon: Shield,
              },
              {
                num: "03",
                title: "AI Analysis",
                desc: "Gemini AI searches your documents for evidence of each compliance requirement, returning citations.",
                icon: Brain,
              },
              {
                num: "04",
                title: "Gap Report",
                desc: "Receive a structured report showing compliant items, detected gaps, and items needing review — all with citations.",
                icon: BarChart3,
              },
            ].map((step, i) => (
              <div key={i} className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center">
                  <span className="text-[var(--primary)] font-bold text-lg">
                    {step.num}
                  </span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                    <step.icon className="w-5 h-5 text-[var(--primary)]" />
                    {step.title}
                  </h3>
                  <p className="text-[var(--muted)] leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Standards */}
      <section id="standards" className="py-20 px-6 border-t border-[var(--border)]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-12">Supported Standards</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "IEC 62304:2006",
                desc: "Medical Device Software Lifecycle",
                rules: "~93 rules",
              },
              {
                name: "ISO 14971:2019",
                desc: "Risk Management for Medical Devices",
                rules: "~26 rules",
              },
              {
                name: "ISO 13485:2016",
                desc: "Quality Management Systems",
                rules: "~34 rules",
              },
            ].map((std, i) => (
              <div key={i} className="glass-card p-6">
                <h3 className="text-lg font-bold gradient-text mb-2">
                  {std.name}
                </h3>
                <p className="text-sm text-[var(--muted)] mb-3">{std.desc}</p>
                <span className="badge badge-compliant">{std.rules}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--primary)]" />
            <span className="font-semibold gradient-text">TraceBridge AI</span>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Phase 2 — Powered by Google Gemini + PostgreSQL
          </p>
        </div>
      </footer>
    </div>
  );
}
