import React from 'react';
import Head from 'next/head';
import classNames from 'classnames';
import CSSTransitionGroup from 'react-addons-css-transition-group';

import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
TimeAgo.addLocale(en);

class IndexPage extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      messageIds: new Set(),
      messages: {},
      status: {},
      heartbeating: false
    };
    this.timeAgo = new TimeAgo('en-US');
  }

  componentDidMount() {
    this.subscribeToSalesforceMessages();
  }

  componentWillUnmount() {
    this.unsubscribeFromSalesforceMessages();
  }

  render() {
    const decendingMessageIds = [...this.state.messageIds].reverse();

    const heartbeating = this.state.heartbeating;
    const heartbeatReason = heartbeating ? 'App is on-line' : 'App is off-line';
    const salesforceStreamIsUp = this.state.status.salesforceStreamingConnectionIsUp;
    const salesforceStreamReason = this.state.status.salesforceStreamingConnectionReason;
    const salesforceReason = heartbeating ? salesforceStreamReason : heartbeatReason;

    return (
      <div className="root">
        <Head>
          <meta charSet="utf-8"/>
          <meta httpEquiv="X-UA-Compatible" content="IE=edge"/>
          <meta name="viewport" content="width=device-width, initial-scale=1"/>
          <title>Geänderte Adressdaten von Salesforce</title>
        </Head>
        <div>
          <h1>{'Geänderte Adressen '}

            <span className={classNames({
              "heart": true,
              "heartbeat": heartbeating
              })}
              title={heartbeatReason}>{'⚡️'}</span>

            <span className={classNames({
              "salesforce-stream": true,
              "salesforce-stream-online": heartbeating && salesforceStreamIsUp
              })}
              title={salesforceReason}>{'☁️'}
            </span>
          </h1>
        </div>
        <ul>
          <CSSTransitionGroup
          transitionName="message"
          transitionEnterTimeout={500}
          transitionLeaveTimeout={500}>

            {decendingMessageIds.map( id => {
              console.log(`has id: ${id}`);
              const message = this.state.messages[id];
              const [header, content, context, payload] = getMessageParts(message);
              console.log(`has payload: ${JSON.stringify(payload)}`);
              let timestamp = new Date(payload.event.createdDate).toLocaleString("de-DE", {timeZone: "Europe/Berlin"});
              return <li style={{"border-bottom": "1px dotted black"}}>
                <p>
                  {timestamp}: Die Rechnungsanschrift von {payload.context.AccountName} (<strong>Kundennummer {payload.sobject.FinServ__CustomerID__c}</strong>) hat sich verändert und lautet jetzt:<br/>
                  <pre>{payload.sobject.BillingStreet}<br/>
{payload.sobject.BillingPostalCode} {payload.sobject.BillingCity}<br/>
{payload.sobject.BillingCountry}</pre>
                </p>
                <p>
                Maschinenlesbare Payload: <br/>
                <div style={{border: "1px solid black", background: "lightgrey", padding: "1em", "font-family": "monospace", "word-break": "break-word"}}>
                  {JSON.stringify(payload, null, 2)}
                </div>
                </p>
              </li>
              ;
            })}

          </CSSTransitionGroup>
        </ul>
        <style jsx>{`
          .root {
            font-family: sans-serif;
            line-height: 1.33rem;
            margin-top: 8vh,
          }
          @media (min-width: 800px) {
            .root {
              margin-left: 31vw;
              margin-right: 11vw;
            }
          }

          ul {
            list-style: none;
            margin: 0;
            padding: 0;
            perspective: 10rem;
          }
          li {
            display: block;
            margin: 0;
            padding: 0;
          }

          .message-enter {
            opacity: 0.01;
          }
          .message-enter.message-enter-active {
            opacity: 1;
            transition: opacity .5s ease-in;
          }

          .message-leave {
            opacity: 1;
          }
          .message-leave.message-leave-active {
            opacity: 0.01;
            transition: opacity .5s ease-out;
          }

          .heart {
            font-size: 2rem;
            opacity: 0.1;
            transition: opacity 2.5s ease-out;
          }
          .heartbeat {
            opacity: 1;
            transition: opacity .5s ease-in;
          }

          .salesforce-stream {
            font-size: 2rem;
            opacity: 0.1;
            transition: opacity 2.5s ease-out;
          }
          .salesforce-stream-online {
            opacity: 1;
            transition: opacity .5s ease-in;
          }
        `}</style>
      </div>
    )
  }

  subscribeToSalesforceMessages = () => {
    const connect = () => {
      // Server-Sent Events (SSE) handler to receive messages
      // https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
      this.eventSource = new EventSource("/stream/messages");
      // Drive "App is on-line" indicator from heartbeat events.
      // `heartbeating` will become false if a heartbeat is not 
      // received within 10-sec period.
      let lastBeat;
      this.eventSource.addEventListener("heartbeat", event => {
        if (lastBeat) clearTimeout(lastBeat);
        this.setState({ heartbeating: true });
        lastBeat = setTimeout(() => {
          this.setState({ heartbeating: false });
        }, 10000);
      }, false);

      // Drive "Salesforce Streaming API is on-line" indicator
      // and description from status events.
      this.eventSource.addEventListener("status", event => {
        const status = JSON.parse(event.data);
        this.setState({
          status: {
            salesforceStreamingConnectionReason: null,
            ...status
          }
        });
      }, false);

      // Receive Salesforce change events as they occur.
      this.eventSource.addEventListener("salesforce", event => {
        const message = JSON.parse(event.data);
        const [header, content, context, payload] = getMessageParts(message); // TODO check this
        console.log(`addEventListener sees header: ${JSON.stringify(header)} content: ${JSON.stringify(content)} context: ${JSON.stringify(context)} payload: ${JSON.stringify(payload)}`)
        const id = payload.sobject.Id + '#' + payload.event.replayId; //header.transactionKey || 'none';
        // Collect message IDs into a Set to dedupe
        this.state.messageIds.add(id);
        // Collect message contents by ID
        this.state.messages[id] = message;
        this.setState({
          messageIds: this.state.messageIds,
          messages: this.state.messages
        });
      }, false);

      this.eventSource.addEventListener("error", err => {
        console.error('EventSource error', err);
        this.eventSource.close();
        setTimeout(() => {
          connect();
        }, 5000);
      }, false);
    }

    connect();
  }

  unsubscribeFromSalesforceMessages = () => {
    this.eventSource.close();
  }
}

function getMessageParts(message) {
  const content = message.payload || {};
  const context = message.context || {};
  const header  = content.ChangeEventHeader || {};
  console.log(`received message of ${JSON.stringify(message)}`);
  // console.log(`received context of ${JSON.stringify(context)}`);
  // console.log(`received content of ${JSON.stringify(content)}`);
  return [header, content, context, message];
}

export default IndexPage;
