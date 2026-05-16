"use client";

import Navbar from './Navbar';
import Hero from './Hero';
import TrustedBy from './TrustedBy';
import Features from './Features';
import HowItWorks from './HowItWorks';
import UseCases from './UseCases';
import Testimonials from './Testimonials';
import Pricing from './Pricing';
import FinalCTA from './FinalCTA';
import Footer from './Footer';

interface LandingPageProps {
  onSignIn: () => void;
  onTrySample: () => void;
}

export default function LandingPage({ onSignIn, onTrySample }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#050508] text-white overflow-x-hidden font-sans">
      <Navbar onSignIn={onSignIn} />
      <Hero onTrySample={onTrySample} />
      <TrustedBy />
      <Features />
      <HowItWorks />
      <UseCases />
      <Testimonials />
      <Pricing />
      <FinalCTA onSignIn={onSignIn} />
      <Footer />
    </div>
  );
}
