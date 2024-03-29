import "./App.css";
import React, { useState, useEffect } from "react";

import CardWheel from "./OptionCard/CardWheel";
import OptionForm from "./NewOption/OptionForm";

import firebase from "./firebase";
import "firebase/firestore";
import "firebase/auth";

import { useAuthState } from "react-firebase-hooks/auth";
import { useCollectionData } from "react-firebase-hooks/firestore";

const auth = firebase.auth();
const db = firebase.firestore();

const cors_api_url = 'https://stormy-wave-70057.herokuapp.com/'

function App() {
    const [cards, updateCards] = useState([] as any);
    const [user, loading] = useAuthState(auth);

    let userID;
    let ref;
    let userRef;

    if (user) {
        userID = user.uid; //gets ID if user is logged in
        ref = db.collection("users");
        userRef = ref.doc(userID);
    }

    //looks at all of user's cards and updates them
    async function newCardsInfo(userCards) {
        let updatedCardList = (userCards.map(async card => {
            let underlyingSymbol = card.underlyingSymbol;
            let purchasePrice = card.purchasePrice; //keep purchase price the same

            let updatedCard = await fetch(`${cors_api_url}https://query2.finance.yahoo.com/v7/finance/options/${underlyingSymbol}`, {
                method: "GET",
                headers: new Headers({
                    'Origin': "http://localhost:3000",
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'

                }),
                mode: "cors",
            })
                .then(res => {
                    return res.json();
                })
                .then(response => {
                    //option has already expired
                    if (response.optionChain.result.length == 0) {
                        card.currentPrice = 0.00;
                        return card;
                    }
                    card = jsonToCard(response);
                    card.purchasePrice = purchasePrice;
                    card.totalReturn = (card.currentPrice - card.purchasePrice) / card.purchasePrice * 100
                    return card;
                }).catch(error => {
                    console.log(error);
                })
            return updatedCard;
        }
        ));
        await Promise.all(updatedCardList).then(list => {
            updateCards(list);
            userRef.update({
                optionCards: list,
            });
        })
    }

    function getCards() {
        ref.where("userID", "==", userID).onSnapshot((querySnapshot) => {
            const userInfo: Array<any> = [];
            querySnapshot.forEach((doc) => {
                userInfo.push(doc.data());
            });

            //if user is in database: gets users cards and renders them
            //if not: does not render any cards
            let userInDatabase = userInfo[0];
            if (userInDatabase) {
                let userCards = userInfo[0].optionCards;
                newCardsInfo(userCards); //fetches new info for each card and updates them
            } else {
                //add the user to the database
                userRef.set({ userID: userID, optionCards: [] });
                updateCards([]);
            }
        });
    }

    useEffect(() => {
        if (user) {
            getCards();
        }
    }, [user]); //run useEffect is the user log in status changes changes

    function addCard(option) {
        updateCards([...cards, option]); //adds new option to cardwheel
        userRef.update({
            optionCards: firebase.firestore.FieldValue.arrayUnion(option), //updates database with new card
        });
    }
    function jsonToCard(response) {
        let jayson = response.optionChain.result[0].quote;
        let type = jayson.symbol
        type = type.charAt(type.length - 9);//C or P 
        type = (type == "C") ? "call" : "put";
        let expArray = jayson.expireIsoDate.split("-");
        let m, d, y;
        m = expArray[1];
        d = expArray[2].slice(0, 2);
        y = expArray[0].slice(2, 4);
        let strike = jayson.strike;
        if (strike === undefined) {//some of API's options dont list strike price
            strike = jayson.symbol.slice(-8); // e.x 00262500
            strike = parseFloat(strike.slice(0, 5) + "." + strike.slice(5));//add decimal and remove extra zeros
        }
        //ticker e.x. (PLTR)
        //underlyingSymbol e.x. (PLTR210226C00015000)
        return {
            ticker: jayson.underlyingSymbol,
            strike: strike,
            purchasePrice: jayson.regularMarketPrice,
            currentPrice: jayson.regularMarketPrice,
            todayReturn: jayson.regularMarketChangePercent,
            totalReturn: jayson.regularMarketChangePercent,
            exp: `${m}/${d}/${y}`,
            type: type,
            underlyingSymbol: jayson.symbol,
        };
    }
    function onSubmit(event) {
        event.preventDefault(event); //prevents page from refreshing on form submit
        let strike = event.target.strike.value;
        let ticker = event.target.ticker.value;
        let expiration = event.target.expiration.value;
        let type = "C";
        let underlyingSymbol;

        let m, y, d;
        let expirationAsArray = expiration.split("/");
        m = expirationAsArray[0];
        d = expirationAsArray[1];
        if (expirationAsArray.length == 3)
            y = expirationAsArray[2];
        else
            y = String(new Date().getFullYear());
        //make sure year is only 2 digits
        if (y.length == 4)
            y = y.slice(-2);
        //make sure date has 2 digits
        if (d.length == 1)
            d = "0" + d;
        //make sure month has 2 digits
        if (m.length == 1)
            m = "0" + m;

        let apiStrike = (100000.000 + parseFloat(strike)).toFixed(3).toString().replace(".", "").substring(1); //get yahoo finance symbol strike code
        underlyingSymbol = `${ticker}${y}${m}${d}${type}${apiStrike}`
        console.log(underlyingSymbol);

        return fetch(`${cors_api_url}https://query2.finance.yahoo.com/v7/finance/options/${underlyingSymbol}`, {
            method: "GET",
            headers: new Headers({
                'Origin': "http://localhost:3000",
                'Content-Type': 'application/json',
                'Accept': 'application/json'

            }),
            mode: "cors",
        })
            .then(res => {
                return res.json()
            })
            .then(response => {
                console.log(response)
                addCard(jsonToCard(response))
            })
            .catch(error => console.log(error))
    }


    return (
        <>
            {user ? (
                [<SignOut></SignOut>, <CardWheel cardList={cards}></CardWheel>]
            ) : (
                    <SignIn></SignIn>
                )}
            <OptionForm onSubmit={(event) => onSubmit(event)}></OptionForm>
        </>
    );
}

function SignIn() {
    const signInWithGoogle = () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider);
    };
    return <button onClick={signInWithGoogle}>Sign in With Google</button>;
}
function SignOut() {
    return (
        auth.currentUser && (
            <button onClick={() => auth.signOut()}>Sign Out</button>
        )
    );
}
export default App;
