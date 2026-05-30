import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, Cpu, Layers, Video, Workflow, ArrowRight, 
  Check, X, Sparkles, Menu, PhoneCall, Zap
} from 'lucide-react';
import ShaderBackground from '../components/ShaderBackground';

// Capitalize Comments And Print Messages Strictly As Instructed
// Welcome Client To Nexis AI Platform
const initMessage = () => {
  console.log("Welcome To Nexis AI Agency Landing Page Dashboard");
};

export const Dashboard: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<number | null>(null);
  
  useEffect(() => {
    initMessage();
  }, []);

  // Services Information Data
  const services = [
    {
      id: 1,
      title: "AI Full-Stack SaaS",
      subtitle: "Next-Gen Applications",
      description: "We Design And Build Scalable Full-Stack SaaS Platforms Supercharged By Embedded LLMs, Cognitive Agents, And Custom Vector Memory Layers.",
      icon: <Layers className="w-6 h-6 text-blue-400" />,
      glowColor: "rgba(59, 130, 246, 0.15)",
      span: "md:col-span-2",
      badge: "Scale Ready",
      visual: (
        <div className="relative w-full h-44 bg-[#080911]/90 rounded-xl border border-gray-900 overflow-hidden flex flex-col p-3">
          <div className="flex items-center justify-between border-b border-gray-950 pb-2 mb-2">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500/80" />
              <span className="w-2 h-2 rounded-full bg-yellow-500/80" />
              <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
            </div>
            <span className="text-[8px] font-mono text-blue-400">SAAS_PIPELINE: ACTIVE</span>
          </div>
          <div className="flex-1 space-y-1.5 font-mono text-[9px] text-gray-500">
            <div className="flex justify-between"><span className="text-gray-400">{"-> Ingesting User Request..."}</span><span className="text-emerald-400">SUCCESS</span></div>
            <div className="flex justify-between"><span className="text-gray-400">{"-> Routing Semantic Weights..."}</span><span className="text-blue-400">142ms</span></div>
            <div className="flex justify-between"><span className="text-gray-400">{"-> Generating Synthesized React UI..."}</span><span className="text-purple-400">PENDING</span></div>
          </div>
          <div className="w-full h-2 bg-gray-950 rounded overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-600"
              initial={{ width: "20%" }}
              animate={{ width: ["20%", "85%", "40%", "95%", "20%"] }}
              transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
            />
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: "AI Agents",
      subtitle: "Autonomous Worker Bots",
      description: "We Ship Self-Directed Agent Swarms That Run Workflows, Analyze Codebases, Process Files, and Manage Business Pipelines Completely Autonomously.",
      icon: <Cpu className="w-6 h-6 text-purple-400" />,
      glowColor: "rgba(139, 92, 246, 0.15)",
      span: "md:col-span-1",
      badge: "Multi-Agent Systems",
      visual: (
        <div className="relative w-full h-44 bg-[#080911]/90 rounded-xl border border-gray-900 p-3 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
            <span className="text-[9px] font-mono text-purple-400 font-bold uppercase tracking-wider">Swarm Engine</span>
          </div>
          <div className="space-y-2">
            <div className="p-1.5 bg-purple-950/20 border border-purple-900/25 rounded-md flex items-center justify-between text-[8px] font-mono">
              <span className="text-gray-300">Agent Alpha (Coder)</span>
              <span className="text-emerald-400">Writing Test Suites</span>
            </div>
            <div className="p-1.5 bg-blue-950/20 border border-blue-900/25 rounded-md flex items-center justify-between text-[8px] font-mono">
              <span className="text-gray-300">Agent Beta (Auditor)</span>
              <span className="text-blue-400">Reviewing PR #442</span>
            </div>
          </div>
          <div className="text-[8px] font-mono text-gray-600 text-center">
            SYSTEM_STABILITY: 99.8% ACCURACY
          </div>
        </div>
      )
    },
    {
      id: 3,
      title: "RAG Pipelines",
      subtitle: "Semantic Retrieval Indexing",
      description: "We Build High-Speed Vector Retrieval Infrastructure Connected To SQLite, FAISS, And Pinecone For Grounded, Zero-Hallucination AI Operations.",
      icon: <Terminal className="w-6 h-6 text-teal-400" />,
      glowColor: "rgba(20, 184, 166, 0.15)",
      span: "md:col-span-1",
      badge: "Zero Hallucinations",
      visual: (
        <div className="relative w-full h-44 bg-[#080911]/90 rounded-xl border border-gray-900 p-3 flex flex-col justify-between overflow-hidden">
          <div className="text-[9px] font-mono text-teal-400 font-bold uppercase tracking-wider">Semantic Vector Space</div>
          <div className="relative flex-1 flex items-center justify-center">
            {/* Draw Simulated Vector Graph Nodes */}
            <div className="absolute w-2 h-2 bg-teal-400 rounded-full blur-[2px] top-6 left-12 animate-pulse" />
            <div className="absolute w-2.5 h-2.5 bg-purple-500 rounded-full blur-[2px] bottom-8 right-16 animate-pulse" />
            <div className="absolute w-2 h-2 bg-blue-500 rounded-full blur-[1px] top-14 right-8" />
            <svg className="absolute w-full h-full stroke-gray-800" style={{ strokeWidth: 1.5 }}>
              <line x1="50" y1="30" x2="160" y2="100" />
              <line x1="160" y1="100" x2="220" y2="60" />
              <line x1="50" y1="30" x2="220" y2="60" />
            </svg>
            <span className="text-[8px] font-mono text-gray-500 absolute bottom-1 text-center w-full">FAISS Cosine Distance Query</span>
          </div>
        </div>
      )
    },
    {
      id: 4,
      title: "Custom Video Solutions",
      subtitle: "AI Video Synthesis Models",
      description: "We Architect Generative Audio-Video Platforms Integrating Diffusion, Sync Labs, and Text-To-Speech APIs For Automated Content Creation Engines.",
      icon: <Video className="w-6 h-6 text-emerald-400" />,
      glowColor: "rgba(16, 185, 129, 0.15)",
      span: "md:col-span-1",
      badge: "Real-Time Render",
      visual: (
        <div className="relative w-full h-44 bg-[#080911]/90 rounded-xl border border-gray-900 p-3 flex flex-col justify-between overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-wider">Generative Frame Stream</span>
            <span className="text-[8px] font-mono text-gray-500">60 FPS</span>
          </div>
          <div className="w-full h-24 bg-gray-950 rounded-lg border border-gray-900/60 overflow-hidden flex items-center justify-center relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-950/20 via-transparent to-teal-950/20" />
            <motion.div 
              className="absolute w-12 h-12 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full blur-xl opacity-60"
              animate={{
                scale: [1, 1.4, 0.9, 1.3, 1],
                x: [-10, 15, -20, 10, -10],
                y: [10, -15, 20, -10, 10]
              }}
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
            />
            <span className="text-[9.5px] font-mono text-white/70 relative font-semibold">SYNTHESIZING...</span>
          </div>
        </div>
      )
    },
    {
      id: 5,
      title: "Custom n8n Workflows",
      subtitle: "Cognitive Ingestion Pipelines",
      description: "We Automate Your Business By Integrating Complex n8n Logic Flow Charts That Orchestrate Data Between APIs, LLMs, and Human-In-The-Loop Checkpoints.",
      icon: <Workflow className="w-6 h-6 text-rose-400" />,
      glowColor: "rgba(244, 63, 94, 0.15)",
      span: "md:col-span-2",
      badge: "Zero Maintenance Systems",
      visual: (
        <div className="relative w-full h-44 bg-[#080911]/90 rounded-xl border border-gray-900 p-3 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-rose-400 font-bold uppercase tracking-wider">Workflow Orchestrator</span>
            <span className="text-[8px] font-mono text-gray-500">Node Connections: 14</span>
          </div>
          <div className="relative flex-1 flex items-center justify-around">
            <div className="p-1.5 bg-gray-950 border border-gray-800 rounded-lg text-[8px] font-mono text-gray-400">
              Webhook
            </div>
            <div className="w-6 h-[1.5px] bg-rose-500/50" />
            <div className="p-1.5 bg-rose-950/20 border border-rose-500/30 rounded-lg text-[8px] font-mono text-rose-400 font-bold">
              Cognitive Agent
            </div>
            <div className="w-6 h-[1.5px] bg-rose-500/50" />
            <div className="p-1.5 bg-gray-950 border border-gray-800 rounded-lg text-[8px] font-mono text-gray-400">
              Slack Alert
            </div>
          </div>
          <div className="text-[8.5px] font-mono text-gray-500 text-center leading-none">
            TRIGGER: NEW LEAD INGESTED
          </div>
        </div>
      )
    }
  ];

  // Old Way Vs AI Way Comparison
  const comparisons = [
    {
      old: "Traditional Code Stack Layouts",
      ai: "Cognitive Dynamic Architectures",
      desc: "Static rules fail when edge cases arise. Autonomous learning pipelines morph automatically."
    },
    {
      old: "High Development Salary Overhead",
      ai: "Zero Infrastructure Maintenance",
      desc: "Instead of massive full-time overhead, deploy lightweight agent swarms that operate 24/7."
    },
    {
      old: "Siloed Application Tools",
      ai: "Connected Vector Context Pipelines",
      desc: "Fragmented systems lead to data loss. Unified semantic retrieval aligns search space instantly."
    }
  ];

  return (
    <div className="relative w-full min-h-screen text-gray-200 font-technical selection:bg-purple-600/30 selection:text-purple-300 pb-0 overflow-x-hidden">
      
      {/* Inject Styling Rules For Marquee Animation Loop */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 16s linear infinite;
        }
      `}</style>

      {/* Reactive WebGL Void Background */}
      <ShaderBackground />

      {/* Grid Pattern Foreground Layer */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#0c0d12_1px,transparent_1px),linear-gradient(to_bottom,#0c0d12_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none z-0" />

      {/* Header: Holographic Glassmorphism Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-900/60 bg-[#030305]/65 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Nexis AI Logo" className="w-7 h-7 rounded-lg object-cover border border-purple-500/35" />
            <span className="font-display font-extrabold text-xs uppercase tracking-wider text-white">Nexis AI Agency</span>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-6">
            <a href="#services" className="text-[10px] uppercase font-bold text-gray-400 hover:text-white tracking-widest transition-colors">Services</a>
            <a href="#why-us" className="text-[10px] uppercase font-bold text-gray-400 hover:text-white tracking-widest transition-colors">Strategy</a>
            <a href="#footer" className="text-[10px] uppercase font-bold text-gray-400 hover:text-white tracking-widest transition-colors">Contact</a>
          </nav>

          {/* CTA Action Button */}
          <div className="flex items-center gap-3">
            <a
              href="https://calendly.com"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#090a10] border border-gray-800 hover:border-purple-500/30 text-[9.5px] uppercase font-bold rounded-lg text-gray-200 transition-all hover:text-white cursor-pointer active:scale-[0.98]"
            >
              <PhoneCall className="w-3 h-3 text-purple-400" />
              Book Launch Call
            </a>

            <button 
              onClick={() => setMobileMenuOpen(prev => !prev)}
              className="md:hidden p-1 text-gray-400 hover:text-white rounded"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              className="absolute top-14 left-0 w-full bg-[#030305]/95 border-b border-gray-900 p-6 flex flex-col gap-4 md:hidden"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <a href="#services" onClick={() => setMobileMenuOpen(false)} className="text-xs uppercase font-bold text-gray-400 tracking-wider">Services</a>
              <a href="#why-us" onClick={() => setMobileMenuOpen(false)} className="text-xs uppercase font-bold text-gray-400 tracking-wider">Strategy</a>
              <a href="#footer" onClick={() => setMobileMenuOpen(false)} className="text-xs uppercase font-bold text-gray-400 tracking-wider">Contact</a>
              <a
                href="https://calendly.com"
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-purple-600 hover:bg-purple-700 text-[10px] uppercase font-bold text-white rounded-lg cursor-pointer"
              >
                Book Launch Call
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Layout Page Assembly */}
      <main className="max-w-6xl mx-auto px-6 relative z-10 space-y-24 md:space-y-36 pt-12 md:pt-20">
        
        {/* Hero Section: Massive Typography And Visual Atmosphere */}
        <section className="flex flex-col items-center justify-center text-center py-8 relative min-h-[75vh] max-w-4xl mx-auto">
          {/* Decorative Sparkle Badge */}
          <motion.div 
            className="flex items-center gap-1.5 px-3 py-1 bg-purple-950/20 border border-purple-500/25 rounded-full text-[9px] uppercase font-bold tracking-widest text-purple-400 mb-8"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI-First Software Agency
          </motion.div>

          {/* Staggered Heading Reveal */}
          <div className="space-y-4">
            <h2 className="font-display font-black text-4xl sm:text-6xl md:text-7xl uppercase text-white leading-[0.9] tracking-tight">
              We Architect <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-500 to-teal-400">
                Autonomous
              </span> <br />
              Systems.
            </h2>

            <p className="text-xs sm:text-sm font-light text-gray-400 max-w-xl mx-auto leading-relaxed pt-2">
              Nexis AI Builds Next-Gen Autonomous Agents, Deep RAG Retrieval Pipelines, And Generative SaaS Architecture Powered By Clean Mathematical GLSL Optimization.
            </p>
          </div>

          {/* Interactive Hero Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3.5 mt-10">
            <a
              href="https://calendly.com"
              target="_blank"
              rel="noreferrer"
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-[10px] uppercase tracking-widest font-bold text-white rounded-lg border border-purple-500 hover:border-purple-400 shadow-xl shadow-purple-500/10 cursor-pointer transition-all active:scale-[0.98]"
            >
              Get Started Now
            </a>
            <a
              href="#services"
              className="px-6 py-3 bg-[#0a0b12] hover:bg-gray-900 text-[10px] uppercase tracking-widest font-bold text-gray-400 hover:text-white rounded-lg border border-gray-800 hover:border-gray-700 transition-all active:scale-[0.98]"
            >
              Explore Services
            </a>
          </div>
        </section>

        {/* Services: Asymmetrical Bento Grid */}
        <section id="services" className="space-y-8 pt-10">
          <div className="max-w-2xl">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest block mb-1">Our Expertise</span>
            <h2 className="font-display font-black text-2xl sm:text-4xl uppercase text-white tracking-tight">
              Platform Capabilities
            </h2>
            <p className="text-[11px] text-gray-500 leading-relaxed font-light mt-1.5">
              Explore Our Autonomous Architecture Services Designed To Replace Archaic Rules-Based Operations.
            </p>
          </div>

          {/* Bento Grid Container */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {services.map((service) => (
              <motion.div
                key={service.id}
                onClick={() => setSelectedService(selectedService === service.id ? null : service.id)}
                className={`relative bg-[#090a10]/45 border border-gray-900 rounded-2xl p-5 overflow-hidden flex flex-col justify-between cursor-pointer group transition-all duration-300 hover:border-gray-800/80 hover:bg-[#0c0d17]/50 ${service.span}`}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
              >
                {/* Backwards Ambient Glow Effect */}
                <div 
                  className="absolute -top-12 -right-12 w-28 h-28 rounded-full blur-[48px] pointer-events-none transition-opacity opacity-0 group-hover:opacity-100 duration-300"
                  style={{ backgroundColor: service.glowColor }}
                />

                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="p-2 bg-gray-950 border border-gray-850 rounded-xl">
                      {service.icon}
                    </div>
                    <span className="text-[8px] font-bold font-mono px-2 py-0.5 bg-gray-950 border border-gray-900 text-gray-500 rounded uppercase tracking-wider">
                      {service.badge}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="font-display text-base font-extrabold text-white group-hover:text-purple-300 transition-colors">
                      {service.title}
                    </h3>
                    <span className="text-[9.5px] font-bold text-gray-500 uppercase tracking-wider block font-mono">
                      {service.subtitle}
                    </span>
                    <p className="text-[10px] text-gray-400 leading-relaxed font-light">
                      {service.description}
                    </p>
                  </div>
                </div>

                {/* Animated Graphic Visualizer */}
                <div className="mt-5 pt-3 border-t border-gray-900/60">
                  {service.visual}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Why Us: Comparative Interface Layout */}
        <section id="why-us" className="space-y-10 pt-10">
          <div className="max-w-2xl">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest block mb-1">Our Strategy</span>
            <h2 className="font-display font-black text-2xl sm:text-4xl uppercase text-white tracking-tight">
              An AI-First Perspective
            </h2>
            <p className="text-[11px] text-gray-500 leading-relaxed font-light mt-1.5">
              Traditional Systems Fall Short In A Semantic Web. Deploy Intelligent Auto-Adapting Agents Built For Scale.
            </p>
          </div>

          {/* Comparison Cards List */}
          <div className="space-y-4">
            {comparisons.map((item, idx) => (
              <div 
                key={idx}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 bg-[#090a10]/35 border border-gray-900 rounded-2xl hover:border-gray-850 transition-colors"
              >
                {/* Old Way Column */}
                <div className="space-y-2 p-3 bg-rose-950/5 border border-rose-900/10 rounded-xl relative overflow-hidden flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 text-[9px] font-bold text-rose-500 uppercase tracking-wider">
                    <X className="w-3.5 h-3.5 text-rose-500" />
                    Legacy System Stack
                  </div>
                  <h4 className="text-xs font-bold text-gray-400">{item.old}</h4>
                </div>

                {/* New Way Column (Glow Representation) */}
                <div className="space-y-2 p-3 bg-purple-950/15 border border-purple-500/25 rounded-xl relative overflow-hidden flex flex-col justify-between shadow-lg shadow-purple-500/[0.02]">
                  <div className="flex items-center gap-1.5 text-[9px] font-bold text-purple-400 uppercase tracking-wider">
                    <Check className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                    Nexis Autonomous Agent
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1">
                      {item.ai}
                      <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                    </h4>
                    <p className="text-[9.5px] text-gray-400 leading-relaxed font-light">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Stats Area */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 py-8 border-y border-gray-900">
          <div className="text-center p-3">
            <span className="text-xs sm:text-sm font-bold text-white font-display block">100M+</span>
            <span className="text-[8px] sm:text-[9px] text-gray-500 uppercase tracking-wider block mt-1">Queries Run</span>
          </div>
          <div className="text-center p-3">
            <span className="text-xs sm:text-sm font-bold text-white font-display block">99.8%</span>
            <span className="text-[8px] sm:text-[9px] text-gray-500 uppercase tracking-wider block mt-1">Agent Uptime</span>
          </div>
          <div className="text-center p-3">
            <span className="text-xs sm:text-sm font-bold text-white font-display block">&lt; 150ms</span>
            <span className="text-[8px] sm:text-[9px] text-gray-500 uppercase tracking-wider block mt-1">Index Latency</span>
          </div>
          <div className="text-center p-3">
            <span className="text-xs sm:text-sm font-bold text-white font-display block">10k+</span>
            <span className="text-[8px] sm:text-[9px] text-gray-500 uppercase tracking-wider block mt-1">Swarm Workers</span>
          </div>
        </section>

      </main>

      {/* Footer: Massive Marquee And Call To Action */}
      <footer id="footer" className="w-full bg-[#030305] border-t border-gray-900/60 mt-36 relative z-10">
        
        {/* Infinite Scrolling Typography Marquee */}
        <div className="w-full bg-purple-950/20 border-b border-purple-500/20 py-5 overflow-hidden flex whitespace-nowrap select-none">
          <div className="inline-flex animate-marquee text-white font-display font-black text-4xl sm:text-6xl md:text-7xl uppercase tracking-wider leading-none">
            <span>let's build the future • let's build the future • let's build the future • let's build the future • </span>
            <span>let's build the future • let's build the future • let's build the future • let's build the future • </span>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-12 md:py-20 grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Nexis Logo" className="w-8 h-8 rounded-lg object-cover border border-purple-500/30" />
              <span className="font-display font-extrabold text-sm uppercase tracking-wider text-white">Nexis AI</span>
            </div>
            <p className="text-[10px] text-gray-500 max-w-sm leading-relaxed font-light">
              An AI-First Engineering Swarm Automating Pipeline Workflows Across SAAS, Video Synthesis, And Deep Retrieval Indexing Space.
            </p>
            <div className="text-[9px] font-mono text-gray-600">
              © 2026 NEXIS AI AGENCY INC. ALL RIGHTS RESERVED.
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="font-display font-bold text-base uppercase text-white">Initiate Pipeline Ingestion</h3>
            <p className="text-[10.5px] text-gray-400 font-light leading-relaxed">
              Book A Dynamic Discovery Call With Our Creative Systems Engineering Team To Map Out Your Custom Swarm Operations.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://calendly.com"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-[9px] uppercase tracking-widest font-bold text-white rounded-lg transition-all"
              >
                Schedule Launch Call
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
              <a
                href="mailto:partner@nexis.ai"
                className="flex items-center gap-2 px-5 py-2.5 bg-[#090a10] border border-gray-800 hover:border-purple-500/30 text-[9px] uppercase tracking-widest font-bold text-gray-400 hover:text-white rounded-lg transition-all"
              >
                partner@nexis.ai
              </a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
};
export default Dashboard;
