import React, { useState, useEffect, useRef } from 'react';
import { Send, RefreshCw, InfoIcon, ArrowRight } from 'lucide-react';
import { ChatApiClient } from '../utils/ApiClient';
import { v4 as uuidv4 } from 'uuid';
import { Authenticator } from '@aws-amplify/ui-react';
import { signOut } from 'aws-amplify/auth';
import '@aws-amplify/ui-react/styles.css';
import { configureAmplify } from '../utils/amplifyConfig';
import { replaceTextEmotesWithEmojis } from './emojiHelper';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import LoadingScreen from '../components/loadingScreen';

// More professional, subtle loading messages
const waitMessages = [
  "Processing your request...",
  "Retrieving information...",
  "Analyzing your query...",
  "Preparing response...",
  "Generating insights...",
];

const getRandomWaitMessage = () => {
  return waitMessages[Math.floor(Math.random() * waitMessages.length)];
};

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  useEffect(() => {
    hljs.highlightAll();
  }, [content]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          return match ? (
            <pre className="bg-gray-50 rounded-md p-4 my-2 overflow-x-auto text-sm font-mono text-gray-800 border border-gray-200">
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          ) : (
            <code className="bg-gray-100 text-gray-800 px-1 rounded font-mono" {...props}>
              {children}
            </code>
          );
        },
        p: ({ node, ...props }) => <p className="mb-2 text-gray-800" {...props} />,
        a: ({ node, ...props }) => <a className="text-indigo-600 hover:text-indigo-800 font-medium" {...props} />,
        h1: ({ node, ...props }) => <h1 className="text-2xl font-semibold mt-4 mb-2 text-gray-900" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-xl font-semibold mt-3 mb-2 text-gray-900" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-lg font-semibold mt-2 mb-1 text-gray-900" {...props} />,
        ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-2 pl-4 text-gray-800" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal mb-2 pl-6 text-gray-800" {...props} />,
        li: ({ node, ...props }) => <li className="mb-1 text-gray-800" {...props} />,
        blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-indigo-300 pl-4 my-2 text-gray-700" {...props} />,
      }}
      className="markdown-content text-gray-800"
    >
      {content}
    </ReactMarkdown>
  );
};

const ChatWindow: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Array<any>>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [running, setRunning] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [client, setClient] = useState<ReturnType<any> | null>(null);
  const [responseReceived, setResponseReceived] = useState(false);

  const createAuthenticatedClient = async () => {
    return new ChatApiClient();
  };

  useEffect(() => {
    initializeSessionId();
  }, []);

  const initializeSessionId = () => {
    let storedSessionId = localStorage.getItem('sessionId');
    if (!storedSessionId) {
      storedSessionId = uuidv4();
      localStorage.setItem('sessionId', storedSessionId);
    }
  };

  const resetSessionId = () => {
    const newSessionId = uuidv4();
    localStorage.setItem('sessionId', newSessionId);
    setMessages([]);
  };

  const initializeClient = async (): Promise<ChatApiClient | null> => {
    try {
      await configureAmplify();
      const newClient = await createAuthenticatedClient();
      setIsAuthenticated(true);
      setClient(newClient);
      return newClient;
    } catch (error) {
      console.error('Error initializing client:', error);
      setIsAuthenticated(false);
      return null;
    }
  };

  useEffect(() => {
    initializeClient();
  }, []);

  const renderMessageContent = (content: string) => {
    const processedContent = replaceTextEmotesWithEmojis(content);
    return <MarkdownRenderer content={processedContent} />;
  };

  useEffect(() => {
    let session_id = localStorage.getItem('sessionId');
    if (session_id == null) {
      session_id = uuidv4();
      localStorage.setItem('sessionId', session_id);
    }
  }, []);

  useEffect(() => {
    if (responseReceived && inputRef.current) {
      inputRef.current.focus();
      setResponseReceived(false); // Reset for next response
    }
  }, [responseReceived]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim() === '') return;

    let currentClient = client;

    if (!currentClient) {
      setRunning(true);
      currentClient = await initializeClient();
      setRunning(false);
      if (!currentClient) {
        setMessages(prevMessages => [
          ...prevMessages,
          {
            content: "Connection error. Please refresh the page and try again.",
            sender: 'System',
            timestamp: new Date().toISOString(),
            isWaiting: false
          }
        ]);
        return;
      }
    }

    const newMessage = {
      content: inputMessage,
      sender: 'You',
      timestamp: new Date().toISOString()
    };

    setMessages(prevMessages => [...prevMessages, newMessage]);
    setInputMessage('');
    setRunning(true);

    setMessages(prevMessages => [
      ...prevMessages,
      {
        content: '',
        sender: '',
        timestamp: new Date().toISOString(),
        isWaiting: true
      }
    ]);

    try {
      const response = await client.query('chat/query', inputMessage);

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let accumulatedContent = "";
        let agentName = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            try {
              const parsedLine = JSON.parse(line);
              switch (parsedLine.type) {
                case 'metadata':
                  agentName = parsedLine.data.metadata.agentName;
                  break;
                case 'chunk':
                case 'complete':
                  accumulatedContent += parsedLine.data;
                  break;
                case 'error':
                  console.error('Error:', parsedLine.data);
                  accumulatedContent += `Error: ${parsedLine.data}\n`;
                  break;
              }
        
              setMessages(prevMessages => [
                ...prevMessages.slice(0, -1),
                {
                  content: accumulatedContent,
                  sender: agentName,
                  timestamp: new Date().toISOString(),
                  isWaiting: false
                }
              ]);
            } catch (error) {
              console.error('Error parsing JSON:', error);
            }
          }
        }
      }

    } catch (error) {
      console.error('Error in API call:', error);
      setMessages(prevMessages => [
        ...prevMessages.slice(0, -1),
        {
          content: `Error: ${(error as Error).message}`,
          sender: 'System',
          timestamp: new Date().toISOString(),
          isWaiting: false
        }
      ]);
    } finally {
      setResponseReceived(true);
      setRunning(false);
    }
  };

  const handleOnboardingClick = () => {
    setInputMessage("onboarding details");
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Error signing out: ', error);
    }
  };

  if (isAuthenticated === null) {
    return <LoadingScreen text="Initializing..." />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <Authenticator>
        {({ signOut: _signOut, user: _user }) => (
          <div className="flex flex-col max-w-screen-lg w-full h-[90vh] bg-white rounded-lg p-6 shadow-md">
            <div className="mb-6 relative">
              <h1 className="text-2xl font-semibold text-gray-900">UrbanIQ</h1>
              <p className="text-sm text-gray-600 mb-3">
                Smart Property Management Platform
              </p>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                <div className="p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-700">
                  <span className="font-medium block">Self-Check-In</span>
                  WiFi details & access instructions
                </div>
                <div className="p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-700">
                  <span className="font-medium block">Facility Booking</span>
                  Reserve shared spaces
                </div>
                <div className="p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-700">
                  <span className="font-medium block">Visitor Management</span>
                  Guest registration & access
                </div>
                <div className="p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-700">
                  <span className="font-medium block">Smart Controls</span>
                  IoT devices & automation
                </div>
                <div className="p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-700">
                  <span className="font-medium block">Incident Reporting</span>
                  Maintenance & security issues
                </div>
                <div className="p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-700">
                  <span className="font-medium block">Weather Updates</span>
                  Real-time forecasts
                </div>
              </div>
              
              <button
                onClick={resetSessionId}
                className="absolute top-0 right-0 bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-full transition-colors duration-200"
                title="New conversation"
              >
                <RefreshCw size={18} />
              </button>
            </div>

            {/* Static Onboarding Card */}
            <div className="mb-4 bg-indigo-50 border border-indigo-100 rounded-lg p-4 shadow-sm">
              <div className="flex items-start">
                <div className="mr-3 text-indigo-600 mt-1">
                  <InfoIcon size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-indigo-800 mb-1">New to UrbanIQ?</h3>
                  <p className="text-sm text-indigo-700 mb-2">
                    Get started with our platform features, access instructions, and property information.
                  </p>
                  <button 
                    onClick={handleOnboardingClick}
                    className="inline-flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    Click for onboarding details
                    <ArrowRight size={14} className="ml-1" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-grow rounded-lg border border-gray-200 overflow-y-auto mb-4 shadow-inner bg-gray-50">
              <div className="p-4">
                {messages.map((msg, index) => (
                  <div key={index} className={`flex mb-4 ${msg.sender === "You" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-3/4 rounded-lg py-2 px-4 shadow-sm ${
                      msg.sender === "You"
                        ? "bg-indigo-50 text-gray-800 border-l-4 border-indigo-400"
                        : "bg-white text-gray-800 border-l-4 border-gray-300"
                    }`}>
                      <div className={`text-xs font-medium mb-1 ${
                        msg.sender === "You"
                          ? "text-indigo-600"
                          : "text-gray-600"
                      }`}>
                        {msg.sender || "UrbanIQ Assistant"}
                      </div>
                      {msg.isWaiting ? (
                        <div className="flex items-center space-x-2 py-2">
                          <div className="relative w-4 h-4">
                            <div className="absolute top-0 h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                          </div>
                          <p className="text-sm text-gray-600">
                            {getRandomWaitMessage()}
                          </p>
                        </div>
                      ) : (
                        <div className="markdown-wrapper">{renderMessageContent(msg.content)}</div>
                      )}
                      <p className="text-xs mt-1 text-gray-400">
                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex mt-auto">
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                className="flex-grow mr-2 p-3 rounded-md bg-white border border-gray-300 text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 shadow-sm"
                placeholder="Type your message..."
                disabled={running}
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-md transition-colors duration-200 shadow-sm disabled:bg-indigo-300"
                disabled={running}
              >
                <Send size={18} />
              </button>
            </form>

            <div className="flex justify-end mt-4">
              <button
                onClick={handleSignOut}
                className="text-sm px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md transition-colors duration-200"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </Authenticator>
    </div>
  );
};

export default ChatWindow;