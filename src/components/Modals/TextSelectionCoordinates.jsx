"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Bookmark, X, BookOpen, StickyNote } from "lucide-react";
import { bookStorageDB } from "../../utils/bookStorageDB";
import { cn } from "../lib/utils";
import DictionaryLookup from "../EpubReaderComponents/DictionaryLookup";

const HIGHLIGHT_COLORS = [
  {
    name: "Lime",
    value: "#84cc16",
    bg: "bg-lime-500",
    hover: "hover:bg-lime-600",
  },
  {
    name: "Green",
    value: "#15803d",
    bg: "bg-green-700",
    hover: "hover:bg-green-800",
  },
  {
    name: "Sky",
    value: "#0369a1",
    bg: "bg-sky-700",
    hover: "hover:bg-sky-800",
  },
  {
    name: "Purple",
    value: "#7e22ce",
    bg: "bg-purple-700",
    hover: "hover:bg-purple-800",
  },
  {
    name: "Pink",
    value: "#be185d",
    bg: "bg-pink-700",
    hover: "hover:bg-pink-800",
  },
  {
    name: "Yellow",
    value: "#ca8a04",
    bg: "bg-yellow-600",
    hover: "hover:bg-yellow-700",
  },
];

const TextSelectionCoordinates = ({
  rendition,
  annotations,
  updatePageInfo,
  saveReadingProgress,
  book,
  bookValue,
  setForceUpdate,
}) => {
  // Split state into separate concerns
  const [selectedTextCoords, setSelectedTextCoords] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");
  const [lastCfiRange, setLastCfiRange] = useState(null);
  const [isColorBoxOpen, setIsColorBoxOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDictionary, setShowDictionary] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState("");

  const colorBoxRef = useRef(null);

  // Handle clicks outside the color picker
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (colorBoxRef.current && !colorBoxRef.current.contains(event.target)) {
        setIsColorBoxOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle text selection
  useEffect(() => {
    const handleTextSelection = (cfiRange) => {
      if (!rendition) return;

      const range = rendition.getRange(cfiRange);

      if (range) {
        // Get the iframe element that contains the book content
        const iframe = document.querySelector("#viewer iframe");
        if (!iframe) return;

        // Get the bounding client rect of the selected text within the iframe
        const rect = range.getBoundingClientRect();

        // Get the iframe's position
        const iframeRect = iframe.getBoundingClientRect();

        // Calculate absolute position by adding iframe position to the selection position
        const absoluteX = rect.x + iframeRect.left;
        const absoluteY = rect.y + iframeRect.top;

        // Calculate position for the color picker
        // Get titlebar height to account for it in positioning
        const titlebar = document.querySelector(".titlebar");
        const titlebarHeight = titlebar ? titlebar.offsetHeight : 0;

        // Calculate preferred position above the text
        const preferredY = absoluteY - 120;
        const minY = titlebarHeight + 10; // Minimum distance from titlebar
        const maxY = window.innerHeight - 200; // Leave space at bottom

        // Position the color picker, ensuring it's visible and not behind titlebar
        const x = Math.min(Math.max(50, absoluteX), window.innerWidth - 200); // Keep within viewport
        let y;

        if (preferredY >= minY) {
          // Position above text if there's enough space
          y = preferredY;
        } else if (absoluteY + rect.height + 130 <= maxY) {
          // Position below text if above doesn't work
          y = absoluteY + rect.height + 10;
        } else {
          // Fallback: position at minimum safe distance from titlebar
          y = minY;
        }

        setSelectedTextCoords({ x, y });
        setSelectedText(range.toString());
        setLastCfiRange(cfiRange);
        setIsColorBoxOpen(true);
      } else {
        setLastCfiRange(null);
        setSelectedTextCoords({ x: 0, y: 0 });
        setIsColorBoxOpen(false);
      }
    };

    // Handle clicks inside the iframe content
    const handleIframeClick = () => {
      if (isColorBoxOpen) {
        setLastCfiRange(null);
        setSelectedTextCoords({ x: 0, y: 0 });
        setIsColorBoxOpen(false);
      }
    };

    if (rendition) {
      rendition.on("selected", handleTextSelection);

      // Add click listener to iframe content when it's ready
      rendition.on("rendered", () => {
        try {
          const contents = rendition.getContents();
          if (contents && contents.document) {
            contents.document.addEventListener("click", handleIframeClick);
          }
        } catch (error) {
          // Silently handle iframe access errors
        }
      });
    }

    return () => {
      if (rendition) {
        rendition.off("selected", handleTextSelection);

        // Remove click listener from iframe content
        try {
          const contents = rendition.getContents();
          if (contents && contents.document) {
            contents.document.removeEventListener("click", handleIframeClick);
          }
        } catch (error) {
          // Silently handle iframe access errors
        }
      }
    };
  }, [rendition, isColorBoxOpen]);

  const handleColorSelection = async (color) => {
    if (!lastCfiRange || !rendition) return;

    setIsSubmitting(true);

    try {
      // Apply highlight locally
      rendition.annotations.highlight(
        lastCfiRange,
        {},
        (e) => console.log("Highlight applied:", e),
        undefined,
        {
          fill: color,
        }
      );

      // Update state
      setSelectedColor(color);

      // Save to IndexedDB
      const annotation = {
        book_isbn: bookValue,
        text: selectedText,
        color: color,
        cfi_range: lastCfiRange,
        created_at: new Date().toISOString(),
        id: `annotation-${Date.now()}`,
        note: noteText || "", // Include note if provided
      };

      await bookStorageDB.addAnnotation(bookValue, annotation);

      // Dispatch event to notify ReaderMenu
      window.dispatchEvent(
        new CustomEvent("annotationCreated", {
          detail: { bookValue, annotation },
        })
      );

      toast.success("Highlight saved successfully");
      console.log("Annotation stored:", annotation);

      // Close all dialogs
      closeAllDialogs();
    } catch (error) {
      console.error("Error storing annotation:", error);
      toast.error(error.message || "Failed to save highlight");
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeAllDialogs = () => {
    setIsColorBoxOpen(false);
    setShowDictionary(false);
    setShowNoteInput(false);
    setNoteText("");
    setSelectedText("");
    setLastCfiRange(null);
  };

  const handleDictionaryLookup = () => {
    setShowDictionary(true);
  };

  const handleAddNote = () => {
    setShowNoteInput(true);
  };

  const handleBookmark = async () => {
    if (!lastCfiRange || !rendition) return;

    try {
      const bookmark = {
        id: `bookmark-${Date.now()}`,
        bookIsbn: bookValue,
        cfi: lastCfiRange,
        chapter: "Current Chapter", // You might want to get actual chapter name
        pageNumber: rendition.book.locations
          ? rendition.book.locations.locationFromCfi(lastCfiRange)
          : null,
        percentage: rendition.book.locations
          ? Math.round(
              rendition.book.locations.percentageFromCfi(lastCfiRange) * 100
            )
          : null,
        createdAt: new Date().toISOString(),
        note: selectedText, // Save selected text as bookmark note
      };

      await bookStorageDB.addBookmark(bookValue, bookmark);
      toast.success("Bookmark added");
      closeAllDialogs();
    } catch (error) {
      console.error("Error adding bookmark:", error);
      toast.error("Failed to add bookmark");
    }
  };

  const closeColorPicker = () => {
    setIsColorBoxOpen(false);
  };

  return (
    <>
      {/* High z-index (z-50/z-60) ensures color picker appears above titlebar (z-10) */}
      {isColorBoxOpen && (
        <div className="fixed inset-0 z-50 pointer-events-none opacity-100">
          <div
            ref={colorBoxRef}
            className="absolute z-[60] animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-auto"
            style={{
              left: `${selectedTextCoords.x}px`,
              top: `${selectedTextCoords.y}px`,
              transform: "translateX(-50%)", // Center horizontally
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative p-3 rounded-lg bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 backdrop-blur-sm">
              <button
                onClick={closeColorPicker}
                className="absolute -top-2 -right-2 rounded-full bg-gray-100 dark:bg-gray-700 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                aria-label="Close color picker"
              >
                <X size={14} />
              </button>

              <div className="mb-2 text-xs text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
                {selectedText}
              </div>

              <div className="flex flex-wrap gap-2 justify-center">
                {HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color.value}
                    className={cn(
                      "w-8 h-8 rounded-full transition-transform duration-200",
                      color.bg,
                      color.hover,
                      "hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    )}
                    onClick={() => handleColorSelection(color.value)}
                    disabled={isSubmitting}
                    aria-label={`Highlight with ${color.name}`}
                    title={color.name}
                  />
                ))}
              </div>

              <div className="mt-3 flex justify-center gap-4">
                <button
                  className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  onClick={handleDictionaryLookup}
                  title="Look up definition"
                >
                  <BookOpen size={14} />
                  <span>Define</span>
                </button>

                <button
                  className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                  onClick={handleAddNote}
                  title="Add note to highlight"
                >
                  <StickyNote size={14} />
                  <span>Note</span>
                </button>

                <button
                  className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors"
                  onClick={handleBookmark}
                  title="Bookmark this location"
                >
                  <Bookmark size={14} />
                  <span>Bookmark</span>
                </button>
              </div>

              {/* Note Input */}
              {showNoteInput && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add a note to this highlight..."
                    className="w-full p-2 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => setShowNoteInput(false)}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setShowNoteInput(false)}
                      className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Save Note
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dictionary Lookup */}
      <DictionaryLookup
        selectedText={selectedText}
        position={selectedTextCoords}
        isVisible={showDictionary}
        onClose={() => setShowDictionary(false)}
      />
    </>
  );
};

export default TextSelectionCoordinates;
