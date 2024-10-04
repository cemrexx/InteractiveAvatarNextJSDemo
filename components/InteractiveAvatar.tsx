import type { StartAvatarResponse } from "@heygen/streaming-avatar";
import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  VoiceEmotion,
} from "@heygen/streaming-avatar";

import {
  Button,
  Card,
  CardBody,
  CardFooter,
  Divider,
  Input,
  Select,
  SelectItem,
  Spinner,
  Chip,
} from "@nextui-org/react";
import { useEffect, useRef, useState } from "react";
import { usePrevious } from "ahooks";
import InteractiveAvatarTextInput from "./InteractiveAvatarTextInput";
import { AVATARS } from "@/app/lib/constants";

export default function InteractiveAvatar() {
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState(false);
  const [stream, setStream] = useState<MediaStream>();
  const [debug, setDebug] = useState<string>();
  const [knowledgeId, setKnowledgeId] = useState<string>("");
  const [avatarId, setAvatarId] = useState<string>("");
  const [data, setData] = useState<StartAvatarResponse>();
  const [text, setText] = useState<string>("");
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatar | null>(null);

  const REACT_APP_LLM_API_TOKEN =
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJleHAiOjE3MjgyOTE4ODYsImlhdCI6MTcyODAzMjY4NiwiZW1haWwiOiJhbW9AeXVra2FsYWIuY29tIiwiZ3JvdXBzIjpbIkFETUlOIiwiU1VCU0NSSVBUSU9OX0FMTCJdfQ.H1kmKTsNM-MXkJ9ym59nPnGQQg8eUbqq-NOLl1t_T_MxumDoNYIGaR3ASjk42Elhp65hsOwqOZX0SZe5polFyw";
  const history = [];
  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();
      console.log("Access Token:", token); // Log the token to verify

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
        avatarName: AVATARS[3].avatar_id,
        knowledgeId: knowledgeId,
        voice: {
          rate: 1, // 0.5 ~ 1.5
          emotion: VoiceEmotion.FRIENDLY,
          voiceId: "f772a099cbb7421eb0176240c611fc43",
        },
      });

      setData(res);
      avatar.current?.on(StreamingEvents.STREAM_READY, (event) => {
        console.log("Stream ready:", event.detail);
        setStream(event.detail);
      });
    } catch (error) {
      console.error("Error starting avatar session:", error);
    } finally {
      setIsLoadingSession(false);
    }
  }

  async function handleSpeak() {
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
            Authorization: `Bearer ${REACT_APP_LLM_API_TOKEN}`, // Use token from environment
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
      await avatar.current
        .speak({
          session_id: data?.session_id!, // Avatar session ID
          text: llmResponse, // LLM's response text
          task_mode: "sync", // Synchronous task mode
          task_type: "repeat", // Type of task; "repeat" or "chat"
        })
        .catch((e) => {
          console.error(
            `Speak method failed for session ${data?.session_id} with text: "${llmResponse}"`,
            e
          );
          setDebug(e.message);
        });
    } catch (error) {
      console.error("Error while communicating with LLM:", error);
      setDebug(`Error while communicating with LLM: ${error.message}`);
    }

    setIsLoadingRepeat(false);
  }

  async function handleInterrupt() {
    if (!avatar.current) {
      setDebug("Avatar API not initialized");

      return;
    }
    await avatar.current.interrupt({ sessionId: 1 }).catch((e) => {
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
      endSession();
    };
  }, []);

  useEffect(() => {
    if (stream && mediaStream.current) {
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
        setDebug("Playing");
      };
    }
  }, [mediaStream, stream]);

  return (
    <div className="w-full flex flex-col gap-4"  style={{
      display: 'flex',              
      alignContent: 'center',         
      justifyContent: 'center'       
    }}>
      <Card>
        <CardBody className="h-[500px] flex flex-col justify-center items-center"  style={{ backgroundColor: '#78787833' }}>
          {stream ? (
            <div className="h-[500px] w-[900px] justify-center items-center flex rounded-lg overflow-hidden" style={{ backgroundColor: '#78787833' }}>
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
                    fontWeight: '400', 
                    border: '1px solid #1f816d',
                    backgroundColor: '#78787833',
                    borderRadius: '5px'
                  }}
                  variant="shadow"
                >
                  Interrupt task
                </Button>
                <Button
                  size="md"
                  onClick={endSession}
                  style={{
                    fontWeight: '400', 
                    backgroundColor: '#1f816d',
                    borderRadius: '5px'
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
                  Custom Knowledge ID (optional)
                </p>
                <Input
                  value={knowledgeId}
                  onChange={(e) => setKnowledgeId(e.target.value)}
                  placeholder="Enter a custom knowledge ID"
                />
              </div>
              <Button
                size="md"
                onClick={startSession}
                style={{
                  fontWeight: '400', 
                  backgroundColor: '#1f816d',
                  borderRadius: '5px', 
                  width: '70%',
                }}
                variant="shadow"
              >
                Start session
              </Button>
            </div>
          ) : (
            <Spinner size="lg" color="default" />
          )}
        </CardBody>
        <Divider />
        <CardFooter className="flex flex-col gap-3 relative"  style={{ backgroundColor: '#78787833' }}>
          <InteractiveAvatarTextInput
            label="Chat"
            placeholder="Type something for the avatar to respond"
            input={text}
            onSubmit={handleSpeak}
            setInput={setText}
            disabled={!stream}
            loading={isLoadingRepeat}
          />
          {text && <Chip className="absolute right-16 top-6">Listening</Chip>}
        </CardFooter>
      </Card>
      {/* <p className="font-mono text-right">
        <span className="font-bold">Console:</span>
        <br />
        {debug}
      </p> */}
    </div>
  );
}
