export default function SubtitleDisplay({ data }) {
    const flagMap = {
      en: "🇬🇧",
      fr: "🇫🇷",
      pa: "🇮🇳",
      hi: "🇮🇳"
    };
  
    // Handle error messages
    if (data.error) {
      return (
        <div className="mb-4 p-4 bg-red-900 rounded-lg shadow-md">
          <p className="text-red-300"><b>Error:</b> {data.error}</p>
        </div>
      );
    }

    // Handle missing translations
    if (!data.translations) {
      return null;
    }
  
    return (
      <div className="mb-4 p-4 bg-gray-800 rounded-lg shadow-md">
        <p className="text-yellow-400"><b>Original:</b> {data.original}</p>
        {Object.entries(data.translations).map(([lang, text]) => (
          <p key={lang} className="text-lg">
            {flagMap[lang] || "🌐"} {text}
          </p>
        ))}
      </div>
    );
  }
  