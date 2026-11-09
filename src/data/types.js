// Shared document shapes. These JSDoc typedefs are the contract between the
// Firestore layer and every feature module — declare the shape here BEFORE
// splitting code that reads/writes it (breakdown §5.1). Field names mirror
// the v1 app exactly so existing data keeps working.

/**
 * @typedef {Object} User
 * @property {string} uid
 * @property {string} name
 * @property {string} email
 * @property {"admin"|"player"} role
 * @property {string} initials
 * @property {string} [photoURL]
 * @property {string} [photoPath]
 * @property {string} sub — display subtitle derived from role ("Head Coach" | "Player")
 */

/**
 * @typedef {Object} Team
 * @property {string} id
 * @property {string} name — full team name, e.g. "Phoenix College Men's Soccer"
 * @property {string} shortName — e.g. "Bears"
 * @property {Object} colors — primary, primaryDeep, accent, accentSoft, success,
 *   danger, info, bg, surface, surface-2, ink, ink2, ink3
 * @property {{logo:string, loginBg:string}} assets
 * @property {string} domain
 * @property {string} pushTitle — fallback push-notification title
 * @property {{cal:number, protein:number, water:number}} targets
 */

/**
 * Audience selector authored by the UI. Absent/null/empty = everyone.
 * @typedef {Object} VisibleTo
 * @property {string[]} [groupIds]
 * @property {string[]} [uids]
 * @property {string[]} [emails]
 */

/**
 * @typedef {Object} EventDoc
 * @property {string} title
 * @property {string} date — local YYYY-MM-DD
 * @property {string} [start] — "HH:MM"
 * @property {string} [end] — "HH:MM"
 * @property {string} [location]
 * @property {string} [type] — Practice | Game | Strength | Recovery | Meeting
 * @property {string} [runByUid]
 * @property {string} [runByName]
 * @property {string} [practiceId]
 * @property {string} [workoutId]
 * @property {string} [workoutName]
 * @property {string} [coachNotes]
 * @property {Array} [reminders]
 * @property {VisibleTo} [visibleTo]
 * @property {string[]} audienceKeys — derived at write time via lib/audience
 * @property {boolean} [isPrivate] — personal events only (subcollection)
 */

/**
 * @typedef {Object} MessageDoc
 * @property {string} text
 * @property {string} sender
 * @property {string} senderUid
 * @property {string} initials
 * @property {boolean} isCoach
 * @property {string} channel — "team" default, or a chatGroups id
 * @property {boolean} [pinned]
 * @property {string} [replyToId]
 * @property {string} [replyToSender]
 * @property {string} [replyToText]
 * @property {{type:string,url:string,path:string,name:string}} [attachment]
 * @property {"poll"} [kind]
 * @property {string} [question]
 * @property {string[]} [options]
 * @property {Object<string,number>} [votes] — uid → optionIndex
 * @property {Object<string,string>} [reactions] — uid → "like"|"dislike"|"heart"
 * @property {Object<string,boolean>} [readBy]
 * @property {string[]} audienceKeys
 */

/**
 * One set prescription inside a workout.
 * @typedef {Object} ExerciseEntry
 * @property {string} exerciseId
 * @property {string} name
 * @property {string} [equipment]
 * @property {string} [sets]
 * @property {string} [reps]
 * @property {string} [weight]
 * @property {string} [loadMode] — "percent" for % of max
 * @property {string} [pct]
 * @property {string} [rpe]
 * @property {string} [tempo]
 * @property {string} [group] — superset label, e.g. "SS A"
 * @property {string} [notes]
 */

/**
 * @typedef {Object} WorkoutDoc
 * @property {string} name
 * @property {ExerciseEntry[]} exercises
 * @property {string} [area] — team workouts grouping
 * @property {string} [createdByUid]
 * @property {string} [createdByName]
 */

/**
 * @typedef {Object} RecipeDoc
 * @property {string} name
 * @property {string} cat — Breakfast | Lunch | Dinner | Snacks | Pre-Game | Post-Game | custom
 * @property {string} [sub] — food-type filter
 * @property {number} cal
 * @property {number} p — protein g
 * @property {number} c — carbs g
 * @property {number} f — fat g
 * @property {string} [prep]
 */

/**
 * @typedef {Object} FoodEntry
 * @property {string} name
 * @property {string} cat
 * @property {number} cal
 * @property {number} p
 * @property {number} c
 * @property {number} f
 * @property {any} time
 * @property {string} [feeling]
 * @property {boolean} [custom]
 */

/**
 * @typedef {Object} DrillDoc
 * @property {string} name
 * @property {string} cat
 * @property {string[]} [tags]
 * @property {string} [dur]
 * @property {string} [players]
 * @property {string} [equipment]
 * @property {string} [desc]
 * @property {string} [info]
 * @property {string} [videoUrl]
 * @property {string[]} [photos]
 * @property {string} [diagram] — PNG export URL
 * @property {Object} [diagramData] — editable tactics-board JSON
 */

/**
 * @typedef {Object} PracticeDoc
 * @property {string} name
 * @property {string} [desc]
 * @property {string} [cat]
 * @property {boolean} published
 * @property {Array<{drillId:string,name:string,cat:string,dur:string,notes:string}>} blocks
 * @property {string} [createdByName]
 */

/**
 * @typedef {Object} ProgramDoc
 * @property {string} name
 * @property {string} [desc]
 * @property {boolean} published
 * @property {Array<{label:string,practiceId:string,note:string}>} days
 */

/**
 * @typedef {Object} LineupDoc
 * @property {string} name
 * @property {string} formation — e.g. "4-3-3"
 * @property {Array<{id:string,x:number,y:number,label:string,uid:string,name:string,initials:string,photoURL:string}>} slots
 */

/**
 * @typedef {Object} AssignmentDoc
 * @property {string} title
 * @property {string} [workoutId]
 * @property {string} [workoutName]
 * @property {string} [body]
 * @property {string} [link]
 * @property {string} [date] — local YYYY-MM-DD
 * @property {VisibleTo} [visibleTo]
 * @property {Object<string,{name:string}>} [completedBy]
 */

export {};
