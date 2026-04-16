import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function parseResume(resumeText: string, masters?: { technologies: string[], teamLeads: string[], rmPersons: string[], mentoringLeads: string[] }) {
  const prompt = `
    Extract candidate information from this resume text:
    ${resumeText}
    
    ${masters?.technologies?.length ? `Available Technologies: ${masters.technologies.join(', ')}` : ''}
    ${masters?.teamLeads?.length ? `Available Team Leads: ${masters.teamLeads.join(', ')}` : ''}
    ${masters?.rmPersons?.length ? `Available RM Persons: ${masters.rmPersons.join(', ')}` : ''}
    ${masters?.mentoringLeads?.length ? `Available Mentoring Leads: ${masters.mentoringLeads.join(', ')}` : ''}

    Return JSON with:
    - name (string)
    - technology (string, match from available list if possible, otherwise best guess)
    - experience (number, total years of experience)
    - teamLead (string, match from available list ONLY if mentioned or strongly implied, otherwise null)
    - rmPerson (string, match from available list ONLY if mentioned or strongly implied, otherwise null)
    - mentoringLead (string, match from available list ONLY if mentioned or strongly implied, otherwise null)
    - skills (array of strings)
    - summary (string)
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          technology: { type: Type.STRING },
          experience: { type: Type.NUMBER },
          teamLead: { type: Type.STRING, nullable: true },
          rmPerson: { type: Type.STRING, nullable: true },
          mentoringLead: { type: Type.STRING, nullable: true },
          skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          summary: { type: Type.STRING }
        },
        required: ["name", "technology", "experience"]
      }
    }
  });
  
  return JSON.parse(response.text || "{}");
}

export async function analyzeJobFit(jobDescription: string, candidateProfile: any) {
  const prompt = `
    Analyze the following Job Description and extract key details.
    
    Job Description:
    ${jobDescription}
    
    Candidate Profile (for context):
    - Target Role Experience: ${candidateProfile.experience} years
    - Technology: ${candidateProfile.technology}
    
    Return JSON with:
    - jdMinExp (number, the minimum years of experience required for the role. If a range like 5-7 is given, return 5. If not specified, return -1)
    - roleTitle (string)
    - isEasyApplyMentioned (boolean, does the text mention Easy Apply?)
    - skillsRequired (array of strings)
    - keyResponsibilities (array of strings)
    - summary (string, 1-2 sentence summary of the role)
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          jdMinExp: { type: Type.NUMBER },
          roleTitle: { type: Type.STRING },
          isEasyApplyMentioned: { type: Type.BOOLEAN },
          skillsRequired: { type: Type.ARRAY, items: { type: Type.STRING } },
          keyResponsibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
          summary: { type: Type.STRING }
        },
        required: ["jdMinExp", "roleTitle", "summary"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}
