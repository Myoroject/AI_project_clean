import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Features from '../components/Features';
import HowItWorks from '../components/HowItWorks';
import UseCases from '../components/UseCases';
import Testimonials from '../components/Testimonials';
import Pricing from '../components/Pricing';
import FinalCTA from '../components/FinalCTA';
import Footer from '../components/Footer';

export default function LandingPage() {
  const navigate = useNavigate();

  const handleSignIn = () => navigate('/signin');
  const handleTrySample = () => navigate('/try');

  return (
    <div className="min-h-screen bg-[#050508] text-white overflow-x-hidden font-sans">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <UseCases />
      <Testimonials />
      <Pricing />
      <FinalCTA />
      <Footer />
    </div>
  );
}
