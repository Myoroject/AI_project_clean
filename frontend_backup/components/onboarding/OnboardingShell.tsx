"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import LandingPage from "../landing/LandingPage";
import LoadingScreen from "./LoadingScreen";
import ResultsScreen from "./ResultsScreen";
import SignInScreen from "./SignInScreen";
import SignInNudgeToast from "./SignInNudgeToast";

type Phase = "entry" | "loading" | "results" | "signin";
type DocSource = "sample" | "upload" | null;
type SigninContext = "demo" | "direct";

export default function OnboardingShell() {
  const router = useRouter();
  
  const [phase, setPhase] = useState<Phase>("entry");
  const [docSource, setDocSource] = useState<DocSource>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [answerCount, setAnswerCount] = useState(0);
  const [toastDismissed, setToastDismissed] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [signinContext, setSigninContext] = useState<SigninContext>("direct");
  const [isUploading, setIsUploading] = useState(false);

  // Authentication Check on Mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/auth/me", { credentials: "include" });
        if (response.ok) {
          router.replace("/dashboard");
        }
      } catch (e) {
        // Not authenticated, stay on onboarding
      }
    };
    checkAuth();
  }, [router]);

  // Toast Logic
  useEffect(() => {
    if (answerCount === 2 && !toastDismissed) {
      setToastVisible(true);
    } else {
      setToastVisible(false);
    }
  }, [answerCount, toastDismissed]);

  const handleTrySample = () => {
    setDocSource("sample");
    setDocId(null);
    setPhase("loading");
    
    // Simulate 5.5s loading time
    setTimeout(() => {
      setPhase("results");
    }, 5500);
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      // Unauthenticated upload
      const response = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
        credentials: "omit", 
      });

      const data = await response.json();
      if (response.ok && data.ok && data.doc_id) {
        setDocSource("upload");
        setDocId(data.doc_id);
        
        // Even if actual upload finishes fast, show loader briefly to set expectations
        setPhase("loading");
        setTimeout(() => {
          setPhase("results");
        }, 5500); // 5.5s fake embedding wait time
      }
    } catch (e) {
      console.error("Upload failed", e);
    } finally {
      setIsUploading(false);
    }
  };

  const navigateToSignIn = (context: SigninContext) => {
    setSigninContext(context);
    setPhase("signin");
    setToastVisible(false); // Hide toast if active
  };

  const handleBack = () => {
    if (phase === "loading") {
      setPhase("entry");
    } else if (phase === "results") {
      setPhase("entry");
    } else if (phase === "signin") {
      if (signinContext === "demo") {
        setPhase("results");
      } else {
        setPhase("entry");
      }
    }
  };

  return (
    <>
      {phase === "entry" && (
        <LandingPage 
          onTrySample={handleTrySample} 
          onSignIn={() => navigateToSignIn("direct")} 
        />
      )}
      
      {phase === "loading" && <LoadingScreen />}
      
      {phase === "results" && (
        <ResultsScreen 
          onBack={handleBack}
          onSignIn={() => navigateToSignIn("demo")}
          onAnswerCountUpdate={setAnswerCount}
          docSource={docSource}
          docId={docId}
        />
      )}
      
      {phase === "signin" && (
        <SignInScreen 
          onBack={handleBack}
          context={signinContext}
        />
      )}
      
      <SignInNudgeToast 
        isVisible={toastVisible && phase === "results"} 
        onContinue={() => navigateToSignIn("demo")}
        onDismiss={() => {
          setToastDismissed(true);
          setToastVisible(false);
        }}
      />
    </>
  );
}
