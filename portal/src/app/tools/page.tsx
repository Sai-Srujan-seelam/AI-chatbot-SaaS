"use client";

import Sidebar from "@/components/sidebar";

const TOOLS = [
  {
    id: "payments",
    name: "Payments",
    description: "Text-to-pay links, terminals, and digital statements with HIPAA-compliant processing",
    features: [
      "Send text-to-pay links to patients",
      "Digital statements with auto-posting",
      "PCI and HIPAA compliant processing",
      "Terminal and online payment options",
    ],
    icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
    color: "bg-green-100 text-green-700",
    status: "coming_soon",
  },
  {
    id: "forms",
    name: "Patient Forms",
    description: "Automated, mobile-friendly intake forms that sync to your EHR",
    features: [
      "Mobile-friendly digital intake forms",
      "Auto-sync to EHR/EMR systems",
      "Automated reminders for incomplete paperwork",
      "HIPAA-compliant data handling",
    ],
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    color: "bg-blue-100 text-blue-700",
    status: "coming_soon",
  },
  {
    id: "reputation",
    name: "Reputation & Growth",
    description: "Review management, SEO visibility tools, and growth marketing",
    features: [
      "Automated review request campaigns",
      "Google and directory listing management",
      "SEO optimization and visibility tools",
      "Patient journey tracking across channels",
    ],
    icon: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
    color: "bg-purple-100 text-purple-700",
    status: "coming_soon",
  },
];

export default function ToolsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Tools & Integrations</h2>
          <p className="text-sm text-gray-500 mt-1">
            Additional tools to grow your practice and streamline operations
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {TOOLS.map((tool) => (
            <div key={tool.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tool.color}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={tool.icon} />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{tool.name}</h3>
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                      Coming Soon
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-4">{tool.description}</p>
                <ul className="space-y-2">
                  {tool.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-500">
                      <svg className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
                <button
                  disabled
                  className="w-full py-2 text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
                >
                  Contact us to enable
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Integration Help */}
        <div className="mt-8 bg-blue-50 rounded-xl border border-blue-200 p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Need a custom integration?</h3>
          <p className="text-sm text-blue-700">
            WonderAvenues can integrate with your existing EHR/EMR, scheduling system, or payment processor.
            Contact your account manager to discuss custom integrations for your practice.
          </p>
        </div>
      </main>
    </div>
  );
}
