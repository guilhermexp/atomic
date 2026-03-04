import React from "react";
import type { SessionEntry } from "@gateway/types";
import { TextInput } from "@shared/kit/forms";
import css from "./MissionControlPage.module.css";

type BrainDoc = { id: string; title: string; content: string };

export function BrainTab(props: {
  docs: BrainDoc[];
  sessions: SessionEntry[];
  fileTree: string[];
  onAddDoc: (doc: BrainDoc) => void;
  onDeleteDoc: (id: string) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [selectedDoc, setSelectedDoc] = React.useState<string | null>(null);
  const [newTitle, setNewTitle] = React.useState("");
  const [newContent, setNewContent] = React.useState("");
  const [showAddDoc, setShowAddDoc] = React.useState(false);

  const filteredSessions = React.useMemo(() => {
    if (!search.trim()) return props.sessions.slice(0, 20);
    const q = search.toLowerCase();
    return props.sessions
      .filter((s) => s.key.toLowerCase().includes(q) || (s.title ?? "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [search, props.sessions]);

  const activeDoc = props.docs.find((d) => d.id === selectedDoc);

  const handleAddDoc = () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    props.onAddDoc({
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      content: newContent.trim(),
    });
    setNewTitle("");
    setNewContent("");
    setShowAddDoc(false);
  };

  return (
    <div className={css.grid}>
      {/* Markdown docs viewer */}
      <section className={`${css.card} ${css.wide}`}>
        <h3>Knowledge Base</h3>
        <div className={css.brainLayout}>
          <div className={css.brainSidebar}>
            <div style={{ marginBottom: 8 }}>
              <button className={css.smallBtn} onClick={() => setShowAddDoc(!showAddDoc)}>
                {showAddDoc ? "Cancel" : "+ Add doc"}
              </button>
            </div>
            {props.docs.length === 0 && !showAddDoc && (
              <p className={css.muted}>No documents yet. Add one to get started.</p>
            )}
            {props.docs.map((d) => (
              <div
                key={d.id}
                className={`${css.brainDocItem} ${selectedDoc === d.id ? css.brainDocActive : ""}`}
                onClick={() => setSelectedDoc(d.id)}
              >
                <span>{d.title}</span>
                <button
                  className={css.tinyBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onDeleteDoc(d.id);
                    if (selectedDoc === d.id) setSelectedDoc(null);
                  }}
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <div className={css.brainContent}>
            {showAddDoc ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <TextInput value={newTitle} onChange={setNewTitle} placeholder="Document title" />
                <textarea
                  className={css.brainTextarea}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Markdown content..."
                  rows={10}
                />
                <button className={css.smallBtn} onClick={handleAddDoc}>
                  Save document
                </button>
              </div>
            ) : activeDoc ? (
              <div className={css.brainMarkdown}>
                <h4>{activeDoc.title}</h4>
                <pre className={css.brainPre}>{activeDoc.content}</pre>
              </div>
            ) : (
              <p className={css.muted}>Select a document to view its content.</p>
            )}
          </div>
        </div>
      </section>

      {/* Session search */}
      <section className={css.card}>
        <h3>Session Search</h3>
        <TextInput value={search} onChange={setSearch} placeholder="Search sessions..." isSearch />
        <div className={css.sessionList}>
          {filteredSessions.length === 0 ? (
            <p className={css.muted}>No sessions found.</p>
          ) : (
            filteredSessions.map((s) => (
              <div key={s.key} className={css.sessionItem}>
                <div className={css.sessionTitle}>{s.title ?? s.key}</div>
                <div className={css.meta}>
                  {s.key}
                  {s.updatedAt ? ` · ${s.updatedAt}` : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* File tree */}
      <section className={css.card}>
        <h3>File Tree</h3>
        {props.fileTree.length === 0 ? (
          <p className={css.muted}>No files tracked.</p>
        ) : (
          <ul className={css.list}>
            {props.fileTree.map((f, i) => (
              <li key={`${i}-${f}`}>
                <span className={css.mono}>{f}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
