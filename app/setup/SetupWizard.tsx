// app/setup/SetupWizard.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Step1Data {
  shopName: string;
  adminEmail: string;
  adminPassword: string;
  confirmPassword: string;
}

interface Step2Data {
  autoflowDomain?: string;
  autoflowApiKey?: string;
  autoflowApiPassword?: string;
}

export default function SetupWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [step1Data, setStep1Data] = useState<Step1Data>({
    shopName: "",
    adminEmail: "",
    adminPassword: "",
    confirmPassword: "",
  });
  const [step2Data, setStep2Data] = useState<Step2Data>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  
  const router = useRouter();

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (step1Data.adminPassword !== step1Data.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    if (step1Data.adminPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    
    setCurrentStep(2);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...step1Data,
          ...step2Data,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Setup failed");
      }

      // Redirect to dashboard
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  if (currentStep === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Setup Your Maintenance System
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Step 1 of 2: Create your shop and admin account
            </p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleStep1Submit}>
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label htmlFor="shopName" className="block text-sm font-medium text-gray-700">
                  Shop Name
                </label>
                <input
                  id="shopName"
                  name="shopName"
                  type="text"
                  required
                  value={step1Data.shopName}
                  onChange={(e) => setStep1Data({ ...step1Data, shopName: e.target.value })}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Your Auto Shop Name"
                />
              </div>
              
              <div>
                <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700">
                  Admin Email
                </label>
                <input
                  id="adminEmail"
                  name="adminEmail"
                  type="email"
                  required
                  value={step1Data.adminEmail}
                  onChange={(e) => setStep1Data({ ...step1Data, adminEmail: e.target.value })}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="admin@yourshop.com"
                />
              </div>
              
              <div>
                <label htmlFor="adminPassword" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="adminPassword"
                  name="adminPassword"
                  type="password"
                  required
                  value={step1Data.adminPassword}
                  onChange={(e) => setStep1Data({ ...step1Data, adminPassword: e.target.value })}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="At least 8 characters"
                />
              </div>
              
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  value={step1Data.confirmPassword}
                  onChange={(e) => setStep1Data({ ...step1Data, confirmPassword: e.target.value })}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Confirm your password"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Continue to Integrations
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Configure Integrations
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Step 2 of 2: Connect your shop management system (optional)
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleFinalSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
          
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">AutoFlow Integration</h3>
              <p className="text-xs text-blue-700 mb-3">
                Connect your AutoFlow system to automatically sync vehicle data and maintenance records.
              </p>
              
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="AutoFlow Subdomain (e.g., yourshop)"
                  value={step2Data.autoflowDomain || ""}
                  onChange={(e) => setStep2Data({ ...step2Data, autoflowDomain: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <input
                  type="text"
                  placeholder="API Key"
                  value={step2Data.autoflowApiKey || ""}
                  onChange={(e) => setStep2Data({ ...step2Data, autoflowApiKey: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <input
                  type="password"
                  placeholder="API Password"
                  value={step2Data.autoflowApiPassword || ""}
                  onChange={(e) => setStep2Data({ ...step2Data, autoflowApiPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex space-x-4">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="flex-1 py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {busy ? "Setting up..." : "Complete Setup"}
            </button>
          </div>
          
          <p className="text-center text-xs text-gray-500">
            You can configure integrations later in the settings panel
          </p>
        </form>
      </div>
    </div>
  );
}