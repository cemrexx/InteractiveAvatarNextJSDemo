import type { StartAvatarResponse } from "@heygen/streaming-avatar";

import { Microphone, StopCircle } from "@phosphor-icons/react";
import Image from "next/image";
import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskType,
  VoiceEmotion,
} from "@heygen/streaming-avatar";
import clsx from "clsx";
import { jwtDecode } from "jwt-decode";
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  Divider,
  Input,
  Spinner,
} from "@nextui-org/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePrevious } from "ahooks";

import yukkaLogo from "../public/Yukka-logo-green.png";

import InteractiveAvatarTextInput from "./InteractiveAvatarTextInput";
import { EyeFilledIcon, EyeSlashFilledIcon } from "./Icons";

export default function InteractiveAvatar() {
  const [cockpitToken, setCockpitToken] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState(false);
  const [stream, setStream] = useState<MediaStream>();
  const [debug, setDebug] = useState<string>();
  const [userEmail, setUserEmail] = useState<string>();
  const [userPassword, setUserPassword] = useState<string>();

  const [data, setData] = useState<StartAvatarResponse>();
  const [text, setText] = useState<string>("");
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatar | null>(null);
  const [passIsVisible, setPassIsVisible] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [avatarIsSpeaking, setAvatarIsSpeaking] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);

  const toggleVisibility = () => setPassIsVisible(!passIsVisible);
  const toogleMicListening = () => setIsListening(!isListening);
  const [recordedUrl, setRecordedUrl] = useState("");
  const audioStream = useRef<MediaStream | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const TOKEN_KEY = "cockpitToken";
  const TOKEN_EXPIRY_KEY = "cockpitTokenExpiry";

  const saveToken = (token: string, expiresIn: number) => {
    const expirationTime = new Date(expiresIn * 1000);

    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, expirationTime.toString());

    setCockpitToken(token);
  };

  // Helper function to check token expiration
  const isTokenExpired = () => {
    const expiration = localStorage.getItem(TOKEN_EXPIRY_KEY);

    if (!expiration) return true; // No expiry set, assume expired

    const now = new Date().getTime();

    return now > Number(expiration); // Check if current time is past the expiration time
  };
  const history: never[] = [];

  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();

      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
    }

    return "";
  }
  async function startSession() {
    setIsLoadingSession(true);
    const newToken = await fetchAccessToken();

    avatar.current = new StreamingAvatar({
      token: newToken,
    });
    const cockpitToken = await fetchCockpitToken();

    if (!cockpitToken) return;
    avatar.current.on(StreamingEvents.AVATAR_START_TALKING, (e) => {
      setAvatarIsSpeaking(true);
    });
    avatar.current.on(StreamingEvents.AVATAR_STOP_TALKING, (e) => {
      setAvatarIsSpeaking(false);
    });
    avatar.current.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      console.log("Stream disconnected");
      endSession();
    });

    try {
      const res = await avatar.current.createStartAvatar({
        quality: AvatarQuality.High,
        avatarName: "37f4d912aa564663a1cf8d63acd0e1ab",
        voice: {
          rate: 1.05, // 0.5 ~ 1.5
          emotion: VoiceEmotion.SERIOUS,
          voiceId: "45980606751346deaf6415a2ba6cdfde",
        },
      });

      setData(res);
      avatar.current?.on(StreamingEvents.STREAM_READY, (event) => {
        console.log("Stream ready:", event.detail);
        setStream(event.detail);
      });
    } catch (error) {
      console.error("Error starting avatar session:", error);
    }
  }
  const handleTranscribe = async (audioBlob: any) => {
    const NEXT_PUBLIC_OPENAI_API_KEY = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    const formData = new FormData();

    formData.append("file", audioBlob); // Add your audio blob here
    formData.append("model", "whisper-1"); // Add the model parameter here

    try {
      const response = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${NEXT_PUBLIC_OPENAI_API_KEY}`,
          },
          body: formData,
        }
      );

      const data = await response.json();
      const transcript = data.text;

      console.log("Transcription:", transcript);
      // setText(transcript);
      handleSpeak(transcript);
    } catch (error) {
      console.error("Error transcribing audio:", error);
    }
  };
  const handleSpeak = useCallback(
    async (inputText: string) => {
      if (!avatar.current) {
        setDebug("Avatar API not initialized");

        return;
      }

      const responses = [
        "That's an excellent question! Let me think about that. I'm currently looking through the latest news and analytics. It may take a few moments. Once I gather all the relevant information, I'll provide you with a concise summary.",
        "You are on fire today! You want to know it all. Let me scan through the news and get back to you on that.",
        "Hmmmm... interesting question. Let me see what I can find in the news about this.",
      ];

      // Randomly choose one response from the array
      const randomResponse =
        responses[Math.floor(Math.random() * responses.length)];

      // Trigger the avatar to speak the randomly chosen response
      await avatarSpeakTrigger(randomResponse);

      setIsLoadingRepeat(true);

      try {
        // Ensure session is active before speaking
        if (!data?.session_id || data?.session_id === "") {
          setDebug("Session is not active. Starting a new session.");
          await startSession(); // Start a new session if none exists
        }

        // Check if text input is valid
        if (!inputText.trim()) {
          setDebug("Message cannot be empty");
          setIsLoadingRepeat(false);

          return;
        }

        // Define the LLM API payload as a valid dictionary (object)
        const payload = {
          message: inputText.trim(), // The message to be sent to the LLM API
          history: history, // Ensure history is an array or object if expected
        };

        // Your LLM API request
        const response = await fetch(
          "https://llm.playground.yukkalab.com/api/v2/chat",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json", // Ensure JSON content-type
              Authorization: `Bearer ${cockpitToken}`, // Use token from environment
            },
            body: JSON.stringify(payload), // Convert JS object to JSON
          }
        );

        if (!response.ok) {
          throw new Error(
            `open returned status ${response.status}: ${response.statusText}`
          );
        }
        const result = await response.json();

        // Ensure that the LLM response contains text for the avatar to speak
        let llmResponse =
          (result.summary && result.summary.text) ||
          (result.messages && result.messages[0]);

        if (llmResponse) {
          if (llmResponse.includes("Summary")) {
            llmResponse = llmResponse.split("Summary")[1].trim();
          } else if (llmResponse.includes("Conclusion")) {
            llmResponse = llmResponse.split("Conclusion")[1].trim();
          }
        }

        llmResponse = llmResponse.replace(/yukka/gi, "YUUKA");

        console.log("Received response from LLM:", llmResponse);

        // Now pass the LLM's response to the avatar for speaking

        avatarSpeakTrigger(llmResponse);
      } catch (error) {
        setDebug(
          `Error while communicating with LLM: ${(error as Error).message}`
        );
      }

      setIsLoadingRepeat(false);
    },
    [text, cockpitToken, data?.session_id]
  );

  async function handleInterrupt() {
    if (!avatar.current) {
      setDebug("Avatar API not initialized");

      return;
    }
    await avatar.current.interrupt().catch((e) => {
      setDebug(e.message);
    });
  }
  async function endSession() {
    if (!avatar.current) {
      setDebug("Avatar API not initialized");

      return;
    }
    await avatar.current.stopAvatar();
    setStream(undefined);
  }

  const fetchNewToken = async () => {
    const user_credential = JSON.stringify({
      email: userEmail,
      password: userPassword,
    });

    try {
      const response = await fetch(
        "https://customer.api.yukkalab.com/v5/authenticate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: user_credential,
        }
      );

      if (!response.ok) throw new Error("Failed to fetch token");

      const result = await response.json();

      // Decode the JWT to extract the expiration time (assuming it's a JWT)
      const tokenObj = jwtDecode(result.token);

      // Save the token and expiration time (exp is in seconds, so convert to milliseconds)
      saveToken(result.token, Number(tokenObj?.exp));

      return result.token;
    } catch (error) {
      console.error("Error fetching token:", error);

      return null;
    }
  };

  async function fetchCockpitToken() {
    const storedToken = localStorage.getItem(TOKEN_KEY);

    if (storedToken && !isTokenExpired()) {
      setCockpitToken(storedToken);

      return storedToken; // Return existing token if it's valid
    }

    // Fetch new token if none exists or it's expired
    const newToken = await fetchNewToken();

    return newToken;
  }
  const avatarSpeakTrigger = async (avatarText: string) => {
    avatar.current
      ?.speak({
        text: avatarText,
        task_type: TaskType.REPEAT,
      })
      .catch((e) => {
        console.error(`Error speaking: ${e.message}`);
        setDebug(e.message);
      });
  };
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioStream.current = stream;
      mediaRecorder.current = new MediaRecorder(stream);
      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.current.push(e.data);
        }
      };
      mediaRecorder.current.onstop = () => {
        const recordedBlob = new Blob(chunks.current, { type: "audio/wav" });
        const formData = new FormData();

        formData.append("file", recordedBlob);
        handleTranscribe(recordedBlob);
        const url = URL.createObjectURL(recordedBlob);

        setRecordedUrl(url);
        chunks.current = [];
      };
      mediaRecorder.current.start();
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  useEffect(() => {
    if (isListening) {
      startRecording();
    } else {
      if (
        mediaRecorder.current &&
        mediaRecorder.current.state === "recording"
      ) {
        mediaRecorder.current.stop();
      }
      if (audioStream.current) {
        audioStream.current.getTracks().forEach((track) => {
          track.stop();
        });
      }
    }
  }, [isListening]);

  const handleMicClick = () => {
    toogleMicListening();
  };

  const previousText = usePrevious(text);

  useEffect(() => {
    if (!previousText && text) {
      avatar.current?.startListening();
    } else if (previousText && !text) {
      avatar?.current?.stopListening();
    }
  }, [text, previousText]);

  useEffect(() => {
    return () => {
      (async () => await endSession())();
    };
  }, []);

  useEffect(() => {
    if (data?.session_id && stream) {
      avatarSpeakTrigger(
        "Hi there, I am your YUUKA LLM News Assistant. How can I assist you today with your financial analysis or any other queries you might have?"
      );
    }
  }, [data?.session_id, stream]);

  useEffect(() => {
    if (stream && mediaStream.current) {
      mediaStream.current.srcObject = stream;
      setIsLoadingSession(false);
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
        setDebug("Playing");
      };
    }
  }, [mediaStream, stream]);

  return (
    <div
      className="w-full flex flex-col gap-4"
      style={{
        display: "flex",
        alignContent: "center",
        justifyContent: "center",
        backgroundColor: "#262626",
      }}
    >
      <div>
        <Image
          alt="Yukka Logo"
          src={yukkaLogo}
          width={150}
          height={100}
          // You'll need to specify both width and height in Next.js
        />
      </div>

      <Card>
        <CardBody
          className="h-[500px] flex flex-col justify-center items-center"
          style={{ backgroundColor: "#363636" }}
        >
          {stream ? (
            <div
              className="h-[500px] w-[900px] justify-center items-center flex rounded-lg overflow-hidden"
              style={{ backgroundColor: "#363636" }}
            >
              <video
                ref={mediaStream}
                autoPlay
                playsInline
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              >
                <track kind="captions" />
              </video>
              <div className="flex flex-col gap-2 absolute bottom-3 right-3">
                <Button
                  size="md"
                  style={{
                    fontWeight: "400",
                    border: "1px solid #1f816d",
                    backgroundColor: "#78787833",
                    borderRadius: "5px",
                  }}
                  variant="shadow"
                  onClick={handleInterrupt}
                >
                  <StopCircle size={32} />
                </Button>
                <Button
                  size="md"
                  style={{
                    fontWeight: "400",
                    backgroundColor: "#1f816d",
                    borderRadius: "5px",
                  }}
                  variant="shadow"
                  onClick={endSession}
                >
                  End session
                </Button>
              </div>
            </div>
          ) : !isLoadingSession ? (
            <div className="h-full justify-center items-center flex flex-col gap-8 w-[500px] self-center">
              <div className="flex flex-col gap-2 w-full">
                <p className="text-sm font-medium leading-none">
                  Cockpit User Email
                </p>
                <Input
                  placeholder="Enter your email"
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                />
                <p
                  className="text-sm font-medium leading-none"
                  style={{ marginTop: "35px" }}
                >
                  Cockpit User Password
                </p>
                <Input
                  className="max-w-full"
                  endContent={
                    <button
                      aria-label="toggle password visibility"
                      className="focus:outline-none"
                      type="button"
                      onClick={toggleVisibility}
                    >
                      {passIsVisible ? (
                        <EyeSlashFilledIcon className="text-2xl text-default-400 pointer-events-none" />
                      ) : (
                        <EyeFilledIcon className="text-2xl text-default-400 pointer-events-none" />
                      )}
                    </button>
                  }
                  placeholder="Enter your password"
                  type={passIsVisible ? "text" : "password"}
                  onChange={(e) => setUserPassword(e.target.value)}
                />
              </div>
              <Button
                size="md"
                style={{
                  fontWeight: "400",
                  backgroundColor: "#1f816d",
                  borderRadius: "5px",
                  width: "70%",
                }}
                variant="shadow"
                onClick={startSession}
              >
                Start speaking with our agent
              </Button>
            </div>
          ) : (
            <Spinner color="default" size="lg" />
          )}
        </CardBody>
        <Divider />
        {stream && (
          <CardFooter
            className="flex flex-col gap-3 relative"
            style={{ backgroundColor: "#78787833" }}
          >
            <InteractiveAvatarTextInput
              disabled={avatarIsSpeaking}
              endContent={
                isLoadingRepeat ? (
                  <Spinner
                    className="text-indigo-300 hover:text-indigo-200"
                    color="default"
                    size="sm"
                  />
                ) : (
                  <Button
                    className={clsx(
                      "text-indigo-300 hover:text-indigo-200",
                      (avatarIsSpeaking || text !== "") && "opacity-0"
                    )}
                    style={{
                      backgroundColor: isListening ? "#1f816d" : "transparent",
                    }}
                    onClick={handleMicClick}
                  >
                    <Microphone
                      className="text-indigo-300 hover:text-indigo-200"
                      size={24}
                    />
                  </Button>
                )
              }
              hideSubmitButton={isListening || text === ""}
              input={text}
              loading={isLoadingRepeat}
              placeholder="Type something for the avatar to respond"
              setInput={setText}
              onSubmit={() => handleSpeak(text)}
            />
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
