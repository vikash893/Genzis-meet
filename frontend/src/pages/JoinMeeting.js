import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ENDPOINTS, normalizeMeetingId, normalizePasscode } from "../api";

function JoinMeeting() {

    const navigate = useNavigate();

    const [meetingId, setMeetingId] = useState("");
    const [passcode, setPasscode] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);


    // ==========================================
    // JOIN MEETING
    // ==========================================

    const handleJoin = async (e) => {

        e.preventDefault();

        setLoading(true);
        setMessage("");


        try {
            const safeMeetingId = normalizeMeetingId(meetingId);
            const safePasscode = normalizePasscode(passcode);

            // ==========================================
            // GET JWT TOKEN
            // ==========================================

            const token =
                localStorage.getItem("token");


            if (!token) {

                setMessage(
                    "Please login first"
                );

                return;
            }


            // ==========================================
            // CALL JOIN MEETING API
            // ==========================================

            const response = await fetch(
                ENDPOINTS.MEETING_JOIN,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },

                    body: JSON.stringify({
                        meetingId: safeMeetingId,
                        passcode: safePasscode
                    })
                }
            );


            // ==========================================
            // READ RESPONSE
            // ==========================================

            const data =
                await response.json();


            // ==========================================
            // API ERROR
            // ==========================================

            if (!response.ok) {

                setMessage(
                    data.message ||
                    "Unable to join meeting"
                );

                return;
            }


            // ==========================================
            // SUCCESS
            // ==========================================

            console.log(
                "Meeting joined:",
                data
            );


            console.log(
                "Authenticated user:",
                data.useremail
            );


            // ==========================================
            // GO TO LIVE MEETING
            // ==========================================

            navigate(
                `/meeting/live/${data.meetingId}?passcode=${encodeURIComponent(safePasscode)}`,
                {
                    state: {
                        email: data.useremail,
                        passcode: safePasscode
                    }
                }
            );


        } catch (error) {

            console.error(
                "Join meeting error:",
                error
            );


            setMessage(
                "Unable to connect to server"
            );


        } finally {

            setLoading(false);

        }

    };


    // ==========================================
    // UI
    // ==========================================

    return (

        <div className="join-page">

            <h1>
                Join Meeting
            </h1>


            <form onSubmit={handleJoin} className="join-form">

                {/* Meeting ID */}

                <input
                    className="join-input"
                    type="text"
                    placeholder="Meeting ID"
                    value={meetingId}
                    onChange={(e) =>
                        setMeetingId(normalizeMeetingId(e.target.value))
                    }
                    required
                />


                <br />
                <br />


                {/* Passcode */}

                <input
                    className="join-input"
                    type="password"
                    placeholder="Passcode"
                    value={passcode}
                    onChange={(e) =>
                        setPasscode(e.target.value)
                    }
                    required
                />


                <br />
                <br />


                {/* Join Button */}

                <button
                    className="join-button"
                    type="submit"
                    disabled={loading}
                >

                    {loading
                        ? "Joining..."
                        : "Join Meeting"
                    }

                </button>

            </form>


            {/* Message */}

            <p className="join-message">
                {message}
            </p>

        </div>

    );

}

export default JoinMeeting;