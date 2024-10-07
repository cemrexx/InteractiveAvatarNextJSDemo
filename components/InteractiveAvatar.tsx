import type { StartAvatarResponse } from "@heygen/streaming-avatar";
import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskType,
  VoiceEmotion,
} from "@heygen/streaming-avatar";
import { jwtDecode } from "jwt-decode";

import {
  Button,
  Card,
  CardBody,
  CardFooter,
  Divider,
  Input,
  Spinner,
  Chip,
} from "@nextui-org/react";
import { useEffect, useRef, useState } from "react";
import { usePrevious } from "ahooks";
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

  const toggleVisibility = () => setPassIsVisible(!passIsVisible);

  const USER_CREDENTIALS = {
    email: "cemre.a@yukkalab.com", // Replace with real values
    password: "12345Aa=",
  };

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
  const history = [];
  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();
      console.log("Access Token:", token);

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
      console.log("Avatar started talking", e);
    });
    avatar.current.on(StreamingEvents.AVATAR_STOP_TALKING, (e) => {
      console.log("Avatar stopped talking", e);
    });
    avatar.current.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      console.log("Stream disconnected");
      endSession();
    });
    try {
      const res = await avatar.current.createStartAvatar({
        quality: AvatarQuality.Low,
        avatarName: "37f4d912aa564663a1cf8d63acd0e1ab",
        voice: {
          rate: 1, // 0.5 ~ 1.5
          emotion: VoiceEmotion.FRIENDLY,
          voiceId: "f772a099cbb7421eb0176240c611fc43",
        },
      });
      console.log("Start avatar response:", res);
      setData(res);
      avatar.current?.on(StreamingEvents.STREAM_READY, (event) => {
        console.log("Stream ready:", event.detail);
        setStream(event.detail);
      });
    } catch (error) {
      console.error("Error starting avatar session:", error);
    }
  }

  async function handleSpeak() {
    avatarSpeakTrigger(
      "That is a very good question I am generating the response for you that will take a few seconds"
    );
    setIsLoadingRepeat(true);
    if (!avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }

    try {
      // Ensure session is active before speaking
      if (!data?.session_id || data?.session_id === "") {
        setDebug("Session is not active. Starting a new session.");
        await startSession(); // Start a new session if none exists
      }

      // Check if text input is valid
      if (!text.trim()) {
        setDebug("Message cannot be empty");
        setIsLoadingRepeat(false);
        return;
      }

      // Define the LLM API payload as a valid dictionary (object)
      const payload = {
        message: text.trim(), // The message to be sent to the LLM API
        history: history, // Ensure history is an array or object if expected
      };

      console.log("Sending payload:", payload); // Debugging

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

      // Check if the response is successful
      if (!response.ok) {
        throw new Error(
          `API returned status ${response.status}: ${response.statusText}`
        );
      }

      // Parse the response as JSON
      const result = await response.json();

      // Ensure that the LLM response contains text for the avatar to speak
      const llmResponse =
        (result.summary && result.summary.text) ||
        (result.messages && result.messages[0]);
      console.log("Received response from LLM:", llmResponse);
      console.log("LLM response:", result);
      // Now pass the LLM's response to the avatar for speaking

      avatarSpeakTrigger(llmResponse);
    } catch (error) {
      setDebug(
        `Error while communicating with LLM: ${(error as Error).message}`
      );
    }

    setIsLoadingRepeat(false);
  }

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
    console.log("userName", userEmail);
    console.log("password", userPassword);
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
        "Welcome to the YukkaLab News Assistant How can I assist you today?"
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
      }}
    >
      <Card>
        <CardBody
          className="h-[500px] flex flex-col justify-center items-center"
          style={{ backgroundColor: "#78787833" }}
        >
          {stream ? (
            <div
              className="h-[500px] w-[900px] justify-center items-center flex rounded-lg overflow-hidden"
              style={{ backgroundColor: "#78787833" }}
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
                  onClick={handleInterrupt}
                  style={{
                    fontWeight: "400",
                    border: "1px solid #1f816d",
                    backgroundColor: "#78787833",
                    borderRadius: "5px",
                  }}
                  variant="shadow"
                >
                  Interrupt task
                </Button>
                <Button
                  size="md"
                  onClick={endSession}
                  style={{
                    fontWeight: "400",
                    backgroundColor: "#1f816d",
                    borderRadius: "5px",
                  }}
                  variant="shadow"
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
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="Enter your email"
                />
                <p className="text-sm font-medium leading-none">
                  Cockpit User Password
                </p>
                <Input
                  placeholder="Enter your password"
                  onChange={(e) => setUserPassword(e.target.value)}
                  className="max-w-full"
                  endContent={
                    <button
                      className="focus:outline-none"
                      type="button"
                      onClick={toggleVisibility}
                      aria-label="toggle password visibility"
                    >
                      {passIsVisible ? (
                        <EyeSlashFilledIcon className="text-2xl text-default-400 pointer-events-none" />
                      ) : (
                        <EyeFilledIcon className="text-2xl text-default-400 pointer-events-none" />
                      )}
                    </button>
                  }
                  type={passIsVisible ? "text" : "password"}
                />
              </div>
              <Button
                size="md"
                onClick={startSession}
                style={{
                  fontWeight: "400",
                  backgroundColor: "#1f816d",
                  borderRadius: "5px",
                  width: "70%",
                }}
                variant="shadow"
              >
                Start Asking Questions to YukkaLab News Assistant
              </Button>
            </div>
          ) : (
            <Spinner size="lg" color="default" />
          )}
        </CardBody>
        <Divider />
        {stream && (
          <CardFooter
            className="flex flex-col gap-3 relative"
            style={{ backgroundColor: "#78787833" }}
          >
            <InteractiveAvatarTextInput
              label="Chat"
              placeholder="Type something for the avatar to respond"
              input={text}
              onSubmit={handleSpeak}
              setInput={setText}
              loading={isLoadingRepeat}
            />
            {text && <Chip className="absolute right-16 top-6">Listening</Chip>}
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
