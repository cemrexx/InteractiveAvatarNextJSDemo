import { Input, Spinner, Tooltip } from "@nextui-org/react";
import { PaperPlaneRight } from "@phosphor-icons/react";
import clsx from "clsx";

interface StreamingAvatarTextInputProps {
  label?: string;
  placeholder: string;
  input: string;
  onSubmit: () => Promise<void>;
  setInput: (value: string) => void;
  endContent?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  hideSubmitButton?: boolean;
}

export default function InteractiveAvatarTextInput({
  label,
  placeholder,
  input,
  onSubmit,
  setInput,
  endContent,
  disabled = false,
  loading = false,
  hideSubmitButton = false,
}: StreamingAvatarTextInputProps) {
  async function handleSubmit() {
    if (input.trim() === "") {
      return;
    }
    await onSubmit();
    setInput("");
  }

  return (
    <Input
      endContent={
        <div className="flex flex-row items-center h-full gap-2">
          {endContent}
          <Tooltip content="Send message">
            {loading ? (
              <Spinner
                className="text-indigo-300 hover:text-indigo-200"
                size="sm"
                color="default"
              />
            ) : (
              <button
                type="submit"
                className="focus:outline-none"
                onClick={handleSubmit}
              >
                <PaperPlaneRight
                  className={clsx(
                    "text-indigo-300 hover:text-indigo-200",
                    (disabled || hideSubmitButton) && "opacity-0"
                  )}
                  size={24}
                />
              </button>
            )}
          </Tooltip>
        </div>
      }
      label={label}
      placeholder={placeholder}
      size="sm"
      value={input}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          handleSubmit();
        }
      }}
      onValueChange={setInput}
      isDisabled={disabled}
    />
  );
}
